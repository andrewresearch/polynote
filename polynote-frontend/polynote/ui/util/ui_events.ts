import {UIEvent} from "./ui_event";
import {TabActivated, NoActiveTab, TabRemoved} from "../component/tab";
import {
    CompletionRequest,
    ParamHintRequest,
    SelectCellEvent, SetCellLanguageEvent
} from "../component/cell";
import {ExecutionStatus, KernelStatus, RunningKernels, TaskInfo} from "../../data/messages";
import {NotebookConfig} from "../../data/data";
import {ReprDataRequest} from "../component/table_view";
import {KernelError} from "../../data/result";
import {NotebookSelected} from "../component/current_notebook";
import {SelectionChangedEvent} from "../component/fake_select";

type TriggerItem = UIEvent<{item: string}>
export type ImportNotebook = UIEvent<{name: string, content: string}>
type ToggleNotebookListUI = UIEvent<{force?: boolean}>

type ViewAbout = UIEvent<{ section: string }>
type ServerVersion = UIEvent<{ version: number, commit: number }>
type RunningKernelsEvt = UIEvent<ConstructorParameters<typeof RunningKernels>>
type KernelStatusEvt = UIEvent<ConstructorParameters<typeof KernelStatus>>
type KernelErrorEvt = UIEvent<ConstructorParameters<typeof KernelError>>
type StartKernel = UIEvent<{path: string}>
type KillKernel = UIEvent<{path: string}>
type LoadNotebook = UIEvent<{path: string}>
type CellResult = UIEvent<{once: boolean}>

type ToggleKernelUI = UIEvent<{force?: boolean}>

type UpdatedTask = UIEvent<{taskInfo: TaskInfo}>
type UpdatedExecutionStatus = UIEvent<{update: ExecutionStatus}>

type UpdatedConfig = UIEvent<{config: NotebookConfig}>

export interface UIEventNameMap extends WindowEventMap {
    "TriggerItem": TriggerItem;
    "NewNotebook": UIEvent<[]>;
    "ImportNotebook": ImportNotebook;
    "ToggleNotebookListUI": ToggleNotebookListUI;
    "TabActivated": TabActivated;
    "NoActiveTab": NoActiveTab;
    "TabRemoved": TabRemoved;
    "RunAll": UIEvent<[]>;
    "RunToCursor": UIEvent<[]>;
    "RunCurrentCell": UIEvent<[]>;
    "CancelTasks": UIEvent<[]>;
    "Undo": UIEvent<[]>;
    "InsertBelow": UIEvent<[]>;
    "ViewAbout": ViewAbout;
    "DownloadNotebook": UIEvent<[]>;
    "ClearOutput": UIEvent<[]>;
    "ServerVersion": ServerVersion;
    "RunningKernels": RunningKernelsEvt;
    "StartKernel": StartKernel;
    "KillKernel": KillKernel;
    "LoadNotebook": LoadNotebook;
    "Connect": UIEvent<[]>;
    "KernelStatus": KernelStatusEvt;
    "SocketClosed": UIEvent<[]>;
    "KernelError": KernelErrorEvt;
    "CellResult": CellResult;
    "ToggleKernelUI": ToggleKernelUI;
    "CellsLoaded": UIEvent<[]>;
    "SelectCell": SelectCellEvent;
    "CompletionRequest": CompletionRequest;
    "ParamHintRequest": ParamHintRequest;
    "SetCellLanguage": SetCellLanguageEvent;
    "UpdatedTask": UpdatedTask;
    "UpdatedExecutionStatus": UpdatedExecutionStatus;
    "UpdatedConfig": UpdatedConfig;
    "ReprDataRequest": ReprDataRequest;
    "NotebookSelected": NotebookSelected;
    "SelectionChange": SelectionChangedEvent;
}