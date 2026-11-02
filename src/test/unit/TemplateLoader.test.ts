import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  loadTemplate,
  loadCompleteTemplate,
  getNonce,
  getWebviewUri,
  getWebviewOptions,
  buildCsp,
  loadPanelTemplate,
  readSharedDbIndexJs,
  readSharedChatActionsJs
} from '../../lib/template-loader';

describe('TemplateLoader', () => {
  let sandbox: sinon.SinonSandbox;
  let readFileStub: sinon.SinonStub;
  let joinPathStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    readFileStub = sandbox.stub();

    // Mock vscode.workspace.fs
    const fsStub = {
      readFile: readFileStub,
      // Add other methods if needed
    };
    sandbox.stub(vscode.workspace, 'fs').value(fsStub);

    // Mock vscode.Uri.joinPath
    joinPathStub = sandbox.stub(vscode.Uri, 'joinPath').callsFake((base, ...segments) => {
      return { fsPath: [base.fsPath, ...segments].join('/') } as vscode.Uri;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('getNonce', () => {
    it('should return a 32-character string', () => {
      const nonce = getNonce();
      expect(nonce).to.be.a('string');
      expect(nonce).to.have.lengthOf(32);
    });

    it('should return unique values', () => {
      const nonce1 = getNonce();
      const nonce2 = getNonce();
      expect(nonce1).to.not.equal(nonce2);
    });
  });

  describe('loadTemplate', () => {
    const extensionUri = { fsPath: '/ext' } as vscode.Uri;

    it('should load simple HTML template', async () => {
      const htmlContent = '<div>Hello</div>';
      readFileStub.resolves(new TextEncoder().encode(htmlContent));

      const result = await loadTemplate(extensionUri, 'test', { folder: 'views' });

      expect(result).to.equal(htmlContent);
      expect(readFileStub.calledOnce).to.be.true;
      // Verify path construction: /ext/templates/views/test.html
      const uri = readFileStub.firstCall.args[0];
      expect(uri.fsPath).to.equal('/ext/templates/views/test.html');
    });

    it('should substitute variables', async () => {
      const htmlContent = '<div>{{message}}</div>';
      readFileStub.resolves(new TextEncoder().encode(htmlContent));

      const result = await loadTemplate(extensionUri, 'test', {
        folder: 'views',
        variables: { message: 'Hello World' }
      });

      expect(result).to.equal('<div>Hello World</div>');
    });

    it('should inject CSS', async () => {
      const htmlContent = '<html>{{STYLES}}<body></body></html>';
      const cssContent = 'body { color: red; }';

      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/test.html'))
        .resolves(new TextEncoder().encode(htmlContent));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/style.css'))
        .resolves(new TextEncoder().encode(cssContent));

      const result = await loadTemplate(extensionUri, 'test', {
        folder: 'views',
        cssFile: 'style.css'
      });

      expect(result).to.contain('<style>\nbody { color: red; }\n</style>');
    });

    it('should inject JS', async () => {
      const htmlContent = '<html><body>{{SCRIPTS}}</body></html>';
      const jsContent = 'console.log("hi");';

      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/test.html'))
        .resolves(new TextEncoder().encode(htmlContent));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/views/script.js'))
        .resolves(new TextEncoder().encode(jsContent));

      const result = await loadTemplate(extensionUri, 'test', {
        folder: 'views',
        jsFile: 'script.js'
      });

      expect(result).to.contain('<script>\nconsole.log("hi");\n</script>');
    });

    it('should clean up unused placeholders', async () => {
      const htmlContent = '{{STYLES}}<div>Content</div>{{SCRIPTS}}';
      readFileStub.resolves(new TextEncoder().encode(htmlContent));

      const result = await loadTemplate(extensionUri, 'test', { folder: 'views' });

      expect(result).to.equal('<div>Content</div>');
    });

    it('returns empty string when readFile fails', async () => {
      readFileStub.rejects(new Error('ENOENT'));

      const result = await loadTemplate(extensionUri, 'test', { folder: 'views' });

      expect(result).to.equal('');
    });
  });

  describe('loadCompleteTemplate', () => {
    const extensionUri = { fsPath: '/ext' } as vscode.Uri;

    it('loads index.html with styles.css and scripts.js', async () => {
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/panel/index.html'))
        .resolves(new TextEncoder().encode('<html>{{STYLES}}{{SCRIPTS}}</html>'));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/panel/styles.css'))
        .resolves(new TextEncoder().encode('body{}'));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/panel/scripts.js'))
        .resolves(new TextEncoder().encode('void 0;'));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/shared/styles.css'))
        .resolves(new TextEncoder().encode(':root{}'));

      const result = await loadCompleteTemplate(extensionUri, 'panel', { title: 'T' });

      expect(result).to.contain('<style>');
      expect(result).to.contain('<script>');
      expect(result).to.contain('body{}');
      expect(result).to.contain(':root{}');
    });
  });

  describe('pro-owned shared templates (absent in free builds)', () => {
    const extensionUri = { fsPath: '/ext' } as vscode.Uri;
    const enoent = () => Object.assign(new Error('ENOENT'), { code: 'FileNotFound' });

    it('readSharedDbIndexJs returns empty string when the file is missing', async () => {
      readFileStub.rejects(enoent());
      expect(await readSharedDbIndexJs(extensionUri)).to.equal('');
    });

    it('readSharedDbIndexJs returns file contents when present (pro build)', async () => {
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/shared/dbindex-shared.js'))
        .resolves(new TextEncoder().encode('window.renderDbIndexesShared = 1;'));
      expect(await readSharedDbIndexJs(extensionUri)).to.equal('window.renderDbIndexesShared = 1;');
    });

    it('readSharedChatActionsJs returns empty string when the file is missing', async () => {
      readFileStub.rejects(enoent());
      expect(await readSharedChatActionsJs(extensionUri)).to.equal('');
    });

    it('loadPanelTemplate renders settings-hub without dbindex-shared.js', async () => {
      readFileStub.rejects(enoent());
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/settings-hub/index.html'))
        .resolves(new TextEncoder().encode('<html><script>{{INLINE_SCRIPTS}}</script></html>'));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/settings-hub/styles.css'))
        .resolves(new TextEncoder().encode('body{}'));
      readFileStub.withArgs(sinon.match.has('fsPath', '/ext/templates/settings-hub/scripts.js'))
        .resolves(new TextEncoder().encode('initHub();'));
      const webview = { cspSource: 'vscode-resource:' } as unknown as vscode.Webview;

      const html = await loadPanelTemplate(webview, extensionUri, 'settings-hub');

      expect(html).to.equal('<html><script>initHub();</script></html>');
    });
  });

  describe('webview helpers', () => {
    it('getWebviewUri delegates to webview.asWebviewUri', () => {
      const extensionUri = { fsPath: '/ext' } as vscode.Uri;
      const expected = { fsPath: 'webview:/joined' } as vscode.Uri;
      const asWebviewUri = sinon.stub().returns(expected);
      const webview = { asWebviewUri } as unknown as vscode.Webview;

      const out = getWebviewUri(webview, extensionUri, ['templates', 'x.css']);

      expect(out).to.equal(expected);
      expect(asWebviewUri.calledOnce).to.be.true;
    });

    it('getWebviewOptions enables scripts and roots extensionUri', () => {
      const extensionUri = { fsPath: '/ext' } as vscode.Uri;
      const opts = getWebviewOptions(extensionUri);
      expect(opts.enableScripts).to.be.true;
      expect(opts.localResourceRoots).to.deep.equal([extensionUri]);
    });

    it('buildCsp references cspSource and nonce', () => {
      const webview = { cspSource: 'https://vscode-resource.example/' } as vscode.Webview;
      const csp = buildCsp(webview, 'n1');
      expect(csp).to.include('nonce-n1');
      expect(csp).to.include('https://vscode-resource.example/');
    });
  });
});
