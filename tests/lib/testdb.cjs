// Runs SQL against the test database: inside the Docker container started by
// database/tests/run.sh (MFD_TEST_DOCKER), or through psql with MFD_TEST_DB.
const {execFileSync}=require('child_process');
const container=process.env.MFD_TEST_DOCKER,url=process.env.MFD_TEST_DB;
exports.available=!!(container||url);
exports.sql=q=>execFileSync(container?'docker':(process.env.MFD_PSQL||'psql'),container?['exec','-i',container,'psql','-U','postgres','-X','-q','-At','-v','ON_ERROR_STOP=1']:[url,'-X','-q','-At','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',maxBuffer:1<<30}).trim();
