"""Real local PTY test, synthetic input only; no browser, network or hosted operation."""
import argparse
import os
import pty
import select
import signal
import subprocess
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument('--node', required=True)
args = parser.parse_args()
secret = b'SYNTHETIC_TTY_SENTINEL'
helper = """
const {hiddenInput}=require('./scripts/c1c-private-terminal.cjs');
hiddenInput('FIXTURE_READY: ',{timeoutMs:1000}).then(value=>{
 if(value!=='SYNTHETIC_TTY_SENTINEL')throw Error('FIXTURE_VALUE');
 console.log('FIXTURE_PASS');
}).catch(()=>{console.log('FIXTURE_STOP');process.exitCode=1;});
"""

for case in ['success', 'paste', 'fragmented-paste', 'signal', 'timeout']:
    master, slave = pty.openpty()
    original = termios.tcgetattr(slave)
    process = subprocess.Popen([args.node, '-e', helper], stdin=slave, stdout=slave, stderr=slave)
    output = b''
    try:
        deadline = time.monotonic() + 5
        sent = False
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                output += os.read(master, 65536)
            if not sent and b'FIXTURE_READY:' in output:
                sent = True
                if case == 'success':
                    os.write(master, secret + b'\r')
                elif case == 'paste':
                    os.write(master, b'\x1b[200~' + secret + b'\x1b[201~')
                elif case == 'fragmented-paste':
                    os.write(master, b'\x1b[200~')
                    time.sleep(0.05)
                    os.write(master, secret)
                    time.sleep(0.05)
                    os.write(master, b'\x1b[201~')
                elif case == 'signal':
                    process.send_signal(signal.SIGTERM)
            if process.poll() is not None:
                break
        process.wait(timeout=2)
        while select.select([master], [], [], 0)[0]:
            output += os.read(master, 65536)
        assert secret not in output, 'SECRET_ECHO'
        assert process.returncode == (0 if case == 'success' else 1), 'UNEXPECTED_EXIT'
        assert (b'FIXTURE_PASS' if case == 'success' else b'FIXTURE_STOP') in output
        restored = termios.tcgetattr(slave)
        mask = termios.ECHO | termios.ICANON
        assert restored[3] & mask == original[3] & mask, 'TTY_NOT_RESTORED'
        print('PASS native PTY ' + case + ': no echo, raw mode restored')
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=2)
        os.close(master)
        os.close(slave)
