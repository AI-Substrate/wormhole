const path = require('path');

module.exports = {
    async execute(bridgeContext, params) {
        const vscode = bridgeContext.vscode;

        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const testFile = path.join(workspaceRoot, 'test', 'python', 'test_example.py');

        return {
            workspaceRoot,
            testFile,
            exists: require('fs').existsSync(testFile)
        };
    }
};
