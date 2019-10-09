'use strict';

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import {UIEventTarget} from '../util/ui_event'
import {Cell, CellContainer, CodeCell, CodeCellModel} from "./cell"
import {div, span, TagElement} from '../util/tags'
import * as messages from '../../data/messages';
import {storage} from '../util/storage'
import {ToolbarUI} from "./toolbar";
import {clientInterpreters} from "../../interpreter/client_interpreter";
import {Position} from "monaco-editor";
import {About} from "./about";
import {SplitView} from "./split_view";
import {KernelUI} from "./kernel_ui";
import {NotebookUI} from "./notebook";
import {TabUI} from "./tab";
import {NotebookListUI} from "./notebook_list";
import {HomeUI} from "./home";
import {Either} from "../../data/types";
import {SocketSession} from "../../comms";
import {ImportNotebook} from "../util/ui_events";
import {CurrentNotebook} from "./current_notebook";

// what is this?
document.execCommand("defaultParagraphSeparator", false, "p");
document.execCommand("styleWithCSS", false);

export const Interpreters: Record<string, string> = {};

export class MainUI extends UIEventTarget {
    private mainView: SplitView;
    readonly toolbarUI: ToolbarUI;
    readonly el: TagElement<"div">;
    readonly notebookContent: TagElement<"div">;
    readonly tabUI: TabUI;
    private browseUI: NotebookListUI;
    private disabled: boolean;
    private currentServerCommit?: number;
    private currentServerVersion: number;
    private about?: About;
    private welcomeUI?: HomeUI;

    constructor() {
        super();
        let left = { el: div(['grid-shell'], []) };
        let center = { el: div(['tab-view'], []) };
        let right = { el: div(['grid-shell'], []) };

        this.mainView = new SplitView('split-view', left, center, right);
        this.toolbarUI = new ToolbarUI().setEventParent(this);

        this.el = div(['main-ui'], [this.toolbarUI.el, this.mainView.el]);

        this.notebookContent = div(['notebook-content'], []);

        this.tabUI = new TabUI({notebook: this.notebookContent, kernel: right.el});
        this.mainView.center.el.appendChild(this.tabUI.el);
        this.mainView.center.el.appendChild(this.notebookContent);

        this.browseUI = new NotebookListUI().setEventParent(this);
        this.mainView.left.el.appendChild(this.browseUI.el);
        this.addEventListener('TriggerItem', evt => {
            if (!this.disabled) {
                this.loadNotebook(evt.detail.item);
            }
        });
        // TODO: remove listeners on children.
        this.browseUI.addEventListener('NewNotebook', () => this.createNotebook());
        this.browseUI.addEventListener('ImportNotebook', evt => this.importNotebook(evt));
        this.browseUI.addEventListener('ToggleNotebookListUI', (evt) => this.mainView.collapse('left', evt.detail && evt.detail.force));
        this.browseUI.init();

        SocketSession.get.listenOnceFor(messages.ListNotebooks, (items) => this.browseUI.setItems(items));
        SocketSession.get.send(new messages.ListNotebooks([]));

        SocketSession.get.listenOnceFor(messages.ServerHandshake, (interpreters, serverVersion, serverCommit) => {
            for (let interp of Object.keys(interpreters)) {
                Interpreters[interp] = interpreters[interp];
            }
            for (let interp of Object.keys(clientInterpreters)) {
                Interpreters[interp] = clientInterpreters[interp].languageTitle;
            }

            this.toolbarUI.cellToolbar.setInterpreters(Interpreters);

            // just got a handshake for a server running on a different commit! We better reload since who knows what could've changed!
            if (this.currentServerCommit && this.currentServerCommit !== serverCommit) {
                document.location.reload();
            }
            this.currentServerVersion = serverVersion;
            this.currentServerCommit = serverCommit;
        });

        SocketSession.get.addEventListener('close', evt => {
           this.browseUI.setDisabled(true);
           this.toolbarUI.setDisabled(true);
           this.disabled = true;
        });

        SocketSession.get.addEventListener('open', evt => {
           this.browseUI.setDisabled(false);
           this.toolbarUI.setDisabled(false);
           this.disabled = false;
        });

        window.addEventListener('popstate', evt => {
           if (evt.state && evt.state.notebook) {
               this.loadNotebook(evt.state.notebook);
           }
        });

        this.tabUI.addEventListener('TabActivated', evt => {
            const tab = evt.detail.tab;
            if (tab.type === 'notebook') {
                const tabPath = `/notebook/${tab.name}`;

                const href = window.location.href;
                const hash = window.location.hash;
                const title = `${tab.name.split(/\//g).pop()} | Polynote`;
                document.title = title; // looks like chrome ignores history title so we need to be explicit here.

                 // handle hashes and ensure scrolling works
                if (hash && window.location.pathname === tabPath) {
                    window.history.pushState({notebook: tab.name}, title, href);
                    this.handleHashChange()
                } else {
                    window.history.pushState({notebook: tab.name}, title, tabPath);
                }

                const currentNotebook = this.tabUI.getTab(tab.name).content.notebook.cellsUI;
                CurrentNotebook.get = currentNotebook.notebookUI; // TODO: better way to set
                currentNotebook.notebookUI.cellUI.forceLayout(evt)
            } else if (tab.type === 'home') {
                const title = 'Polynote';
                window.history.pushState({notebook: tab.name}, title, '/');
                document.title = title
            }
        });

        window.addEventListener('hashchange', evt => {
            this.handleHashChange()
        });

        // TODO: we probably shouldn't be adding listeners on our children like this
        this.tabUI.addEventListener('NoActiveTab', () => {
            this.showWelcome();
        });

        this.addEventListener('CancelTasks', () => {
           SocketSession.get.send(new messages.CancelTasks(CurrentNotebook.get.path));
        });

        this.addEventListener('ViewAbout', (evt) => {
            if (!this.about) {
                this.about = new About().setEventParent(this);
            }
            this.about.show(evt.detail.section);
        });

        this.addEventListener('DownloadNotebook', () => {
            MainUI.browserDownload(window.location.pathname + "?download=true", CurrentNotebook.get.path);
        });

        this.addEventListener('ClearOutput', () => {
            SocketSession.get.send(new messages.ClearOutput(CurrentNotebook.get.path))
        });

        // START new listeners TODO: remove this comment once everything's cleaned up

        this.respond('ServerVersion', evt => {
            evt.detail.callback(this.currentServerVersion, this.currentServerCommit);
        });

        this.respond('RunningKernels', evt => {
            SocketSession.get.request(new messages.RunningKernels([])).then((msg) => {
                evt.detail.callback(msg.kernelStatuses)
            })
        });

        // TODO: consolidate all start kernel requests to this function
        this.addEventListener('StartKernel', evt => {
            SocketSession.get.send(new messages.StartKernel(evt.detail.path, messages.StartKernel.NoRestart));
        });

        // TODO: consolidate all kill kernel requests to this function
        this.addEventListener('KillKernel', evt => {
            if (confirm("Kill running kernel? State will be lost.")) {
                SocketSession.get.send(new messages.StartKernel(evt.detail.path, messages.StartKernel.Kill));
            }
        });

        this.addEventListener('LoadNotebook', evt => this.loadNotebook(evt.detail.path));

        this.addEventListener('Connect', () => {
            if (SocketSession.get.isClosed) {
                SocketSession.get.reconnect(true);
            }
        });

        // socket message handlers
        this.handleEventListenerRegistration('KernelStatus', evt => {
            SocketSession.get.addMessageListener(messages.KernelStatus, (path, update) => {
                evt.detail.callback(path, update)
            });
        });

        this.handleEventListenerRegistration('SocketClosed', evt => {
            SocketSession.get.addEventListener('close', _ => {
                evt.detail.callback()
            });
        });

        this.handleEventListenerRegistration('KernelError', evt => {
            SocketSession.get.addMessageListener(messages.Error, (code, err) => {
                evt.detail.callback(code, err)
            });
        });

        this.handleEventListenerRegistration('CellResult', evt => {
           SocketSession.get.addMessageListener(messages.CellResult, () => {
               evt.detail.callback();
           }, evt.detail.once);
        });

        this.handleEventListenerRegistration('resize', evt => {
            window.addEventListener('resize', () => evt.detail.callback())
        })
    }

    showWelcome() {
        if (!this.welcomeUI) {
            this.welcomeUI = new HomeUI().setEventParent(this);
        }
        const welcomeKernelUI = new KernelUI(this, '/', /*showInfo*/ false, /*showSymbols*/ false, /*showTasks*/ true, /*showStatus*/ false);
        this.tabUI.addTab('home', span([], 'Home'), {
            notebook: this.welcomeUI.el,
            kernel: welcomeKernelUI.el
        }, 'home');
    }

    loadNotebook(path: string) {
        const notebookTab = this.tabUI.getTab(path);

        if (!notebookTab) {
            const notebookUI = new NotebookUI(this, path, this); // TODO: remove these `this`
            SocketSession.get.send(new messages.LoadNotebook(path));
            const tab = this.tabUI.addTab(path, span(['notebook-tab-title'], [path.split(/\//g).pop()!]), {
                notebook: notebookUI.cellUI.el,
                kernel: notebookUI.kernelUI.el
            }, 'notebook');
            this.tabUI.activateTab(tab);

            notebookUI.kernelUI.addEventListener('ToggleKernelUI', (evt) => {
                this.mainView.collapse('right', evt.detail && evt.detail.force)
            });

        } else {
            this.tabUI.activateTab(notebookTab);
        }

        const notebookName = path.split(/\//g).pop()!;

        storage.update<{name: string, path: string}[]>('recentNotebooks', recentNotebooks => {
            const currentIndex = recentNotebooks.findIndex(nb => nb.path === path);
            if (currentIndex !== -1) {
                recentNotebooks.splice(currentIndex, 1);
            }
            recentNotebooks.unshift({name: notebookName, path: path});
            return recentNotebooks;
        })
    }

    createNotebook() {
        const handler = SocketSession.get.addMessageListener(messages.CreateNotebook, (actualPath) => {
            SocketSession.get.removeMessageListener(handler);
            this.browseUI.addItem(actualPath);
            this.loadNotebook(actualPath);
        });

        const notebookPath = prompt("Enter the name of the new notebook (no need for an extension)");
        if (notebookPath) {
            SocketSession.get.send(new messages.CreateNotebook(notebookPath))
        }
    }

    importNotebook(evt: ImportNotebook) {
        const handler = SocketSession.get.addMessageListener(messages.CreateNotebook, (actualPath) => {
            SocketSession.get.removeMessageListener(handler);
            this.browseUI.addItem(actualPath);
            this.loadNotebook(actualPath);
        });

        if (evt.detail && evt.detail.name) { // the evt has all we need
            SocketSession.get.send(new messages.CreateNotebook(evt.detail.name, Either.right(evt.detail.content)));
        } else {
            const userInput = prompt("Enter the full URL of another Polynote instance.");
            const notebookURL = userInput && new URL(userInput);

            if (notebookURL && notebookURL.protocol.startsWith("http")) {
                const nbFile = decodeURI(notebookURL.pathname.split("/").pop()!);
                notebookURL.search = "download=true";
                notebookURL.hash = "";
                SocketSession.get.send(new messages.CreateNotebook(nbFile, Either.left(notebookURL.href)));
            }
        }
    }

    handleHashChange() {
        this.addEventListener('CellsLoaded', evt => {
            const hash = document.location.hash;
            // the hash can (potentially) have two parts: the selected cell and selected lines.
            // for example: #Cell2,6-12 would mean Cell2 lines 6-12
            const [hashId, lines] = hash.slice(1).split(",");

            const selected = document.getElementById(hashId) as CellContainer;
            if (selected && selected.cell && selected.cell !== Cell.currentFocus) {

                // highlight lines
                if (lines) {
                    let [startLine, endLine] = lines.split("-").map(s => parseInt(s));
                    const startPos = Position.lift({lineNumber: startLine, column: 0});

                    let endPos;
                    if (endLine) {
                        endPos = Position.lift({lineNumber: endLine, column: 0});
                    } else {
                        endPos = Position.lift({lineNumber: startLine + 1, column: 0});
                    }

                    if (selected.cell instanceof CodeCell) {
                        selected.cell.setHighlight({
                            startPos: startPos,
                            endPos: endPos
                        }, "link-highlight")
                    }
                }
                // select cell and scroll to it.
                selected.cell.focus();
            }
        });
    }

    static browserDownload(path: string, filename: string) {
        const link = document.createElement('a');
        link.setAttribute("href", path);
        link.setAttribute("download", filename);
        link.click()
    }
}

// TODO: move all these to happen when server handshake gives list of languages
monaco.languages.registerCompletionItemProvider('scala', {
  triggerCharacters: ['.'],
  provideCompletionItems: (doc, pos, context, cancelToken) => {
      return (doc as CodeCellModel).cellInstance.requestCompletion(doc.getOffsetAt(pos));
  }
});

monaco.languages.registerCompletionItemProvider('python', {
  triggerCharacters: ['.'],
  provideCompletionItems: (doc, pos, cancelToken, context) => {
      return (doc as CodeCellModel).cellInstance.requestCompletion(doc.getOffsetAt(pos));
  }
});

monaco.languages.registerSignatureHelpProvider('scala', {
  signatureHelpTriggerCharacters: ['(', ','],
  provideSignatureHelp: (doc, pos, cancelToken, context) => {
      return (doc as CodeCellModel).cellInstance.requestSignatureHelp(doc.getOffsetAt(pos));
  }
});

monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp: (doc, pos, cancelToken, context) => {
        return (doc as CodeCellModel).cellInstance.requestSignatureHelp(doc.getOffsetAt(pos));
    }
});

monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.'],
    provideCompletionItems: (doc, pos, context, cancelToken) => {
        return (doc as CodeCellModel).cellInstance.requestCompletion(doc.getOffsetAt(pos));
    }
});