package site.mfd.shared

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class SyncTest {
    private fun cmd(s: String) = Sync.command(s.toByteArray())

    @Test fun acceptsWellFormedCommands() {
        val c = cmd("""{"v":1,"id":"a1b2c3d4e5","type":"logSet","exercise":0,"set":1}""")
        assertNotNull(c); assertEquals("logSet", c!!.getString("type"))
    }

    @Test fun refusesBadCommands() {
        for (bad in listOf("", "not json", """{"v":2,"id":"a1b2c3d4e5","type":"logSet"}""", """{"v":1,"id":"short","type":"logSet"}""",
            """{"v":1,"id":"a1b2c3d4e5","type":"log set!"}""", """{"v":1,"type":"logSet"}""")) assertNull(bad, cmd(bad))
        assertNull(Sync.command(ByteArray(Sync.MAX_COMMAND_BYTES + 1) { 'x'.code.toByte() }))
    }

    @Test fun checksSnapshots() {
        assertNotNull(Sync.state("""{"v":1,"routines":[],"workout":null}"""))
        assertNull(Sync.state("""{"v":1}"""))
        assertNull(Sync.state("""{"v":1,"routines":["${"x".repeat(Sync.MAX_STATE_BYTES)}"]}"""))
    }
}
