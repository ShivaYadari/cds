import {AfterViewInit, Component, ViewChild} from '@angular/core';
import {GroupPermission} from '@cds/model/group.model';
import {AutoUnsubscribe} from '@cds/shared/decorator/autoUnsubscribe';
import {ProjectState, ProjectStateModel} from '@cds/store/project.state';
import {WorkflowState, WorkflowStateModel} from '@cds/store/workflow.state';
import {TranslateService} from '@ngx-translate/core';
import {Store} from '@ngxs/store';
import {PermissionValue} from 'app/model/permission.model';
import {Project} from 'app/model/project.model';
import {WNode, WNodeHook, Workflow} from 'app/model/workflow.model';
import {PermissionEvent} from 'app/shared/permission/permission.event.model';
import {ToastService} from 'app/shared/toast/ToastService';
import {CloseEditModal, UpdateWorkflow} from 'app/store/workflow.action';
import {cloneDeep} from 'lodash';
import {ModalSize, ModalTemplate, SuiModalService, TemplateModalConfig} from 'ng2-semantic-ui';
import {ActiveModal} from 'ng2-semantic-ui/dist';
import {Subscription} from 'rxjs';
import {finalize} from 'rxjs/operators';

@Component({
    selector: 'app-node-edit-modal',
    templateUrl: './node.edit.modal.html',
    styleUrls: ['./node.edit.modal.scss']
})
@AutoUnsubscribe()
export class WorkflowNodeEditModalComponent implements AfterViewInit {

    project: Project;
    workflow: Workflow;
    node: WNode;
    beforeNode: WNode;
    hook: WNodeHook;
    groups: Array<GroupPermission>;


    @ViewChild('nodeEditModal')
    public nodeEditModal: ModalTemplate<boolean, boolean, void>;
    modal: ActiveModal<boolean, boolean, void>;
    modalConfig: TemplateModalConfig<boolean, boolean, void>;

    selected: string;
    hasModification = false;


    permissionEnum = PermissionValue;
    loading = false;

    projectSubscriber: Subscription;
    storeSub: Subscription;

    constructor(private _modalService: SuiModalService, private _store: Store,
                private _translate: TranslateService, private _toast: ToastService) {

        this.projectSubscriber = this._store.select(ProjectState)
            .subscribe((projState: ProjectStateModel) => {
                this.project = projState.project;
            });
    }

    ngAfterViewInit(): void {
        this.storeSub = this._store.select(WorkflowState.getCurrent()).subscribe( (s: WorkflowStateModel) => {
            if (!s.editModal) {
                this.hook = undefined;
                this.node = undefined;
                delete this.selected;
                if (this.modal) {
                    this.modal.approve(true);
                }
                return;
            }
            if (s.node) {
                this.workflow = s.workflow;
                let open = this.node != null;
                this.node = cloneDeep(s.node);
                this.groups = cloneDeep(this.node.groups);
                this.beforeNode = cloneDeep(s.node);
                if (s.hook) {
                    this.hook = cloneDeep(s.hook);
                }
                if (!this.selected) {
                    if (this.hook) {
                        this.selected = 'hook';
                    } else {
                        switch (this.node.type) {
                            case 'outgoinghook':
                                this.selected = 'outgoinghook';
                                break;
                            default:
                                this.selected = 'context';
                        }
                    }
                }
                if (!open) {
                    this.show();
                }
            }
        });
    }

    show(): void {
        if (this.nodeEditModal) {
            this.modalConfig = new TemplateModalConfig<boolean, boolean, void>(this.nodeEditModal);
            this.modalConfig.mustScroll = true;
            this.modalConfig.size = ModalSize.Large;
            this.modalConfig.isClosable = true;
            this.modal = this._modalService.open(this.modalConfig);
            this.modal.onApprove(() => {
                this._store.dispatch(new CloseEditModal({}));
            });
            this.modal.onDeny(() => {
                this._store.dispatch(new CloseEditModal({}));
            });
        } else {
            this.modal = this._modalService.open(this.modalConfig);
            this.modal.onApprove(() => {
                this._store.dispatch(new CloseEditModal({}));
            });
            this.modal.onDeny(() => {
                this._store.dispatch(new CloseEditModal({}));
            });
        }
    }

    groupManagement(event: PermissionEvent, skip?: boolean): void {
        this.loading = true;
        switch (event.type) {
            case 'add':
                if (!this.node.groups) {
                    this.node.groups = [];
                }
                this.node.groups.push(event.gp);
                break;
            case 'update':
                this.node.groups = this.node.groups.map((group) => {
                    if (group.group.name === event.gp.group.name) {
                        group = event.gp;
                    }
                    return group;
                });
                break;
            case 'delete':
                this.node.groups = this.node.groups.filter((group) => group.group.name !== event.gp.group.name);
                break;
        }
        let workflow = cloneDeep(this.workflow);
        let node = Workflow.getNodeByID(this.node.id, workflow);
        node.groups = this.node.groups;

        this._store.dispatch(new UpdateWorkflow({
            projectKey: this.workflow.project_key,
            workflowName: this.workflow.name,
            changes: workflow
        })).pipe(finalize(() => this.loading = false))
            .subscribe(() => {
                this.hasModification = false;
                event.gp.updating = false;
                this._toast.success('', this._translate.instant('permission_updated'));
            });
    }

    pushChange(b: boolean): void {
        this.hasModification = b;
    }

    changeView(newView: string): void {
        if (this.selected === newView) {
         return;
        }
        if (this.hasModification) {
            if (confirm(this._translate.instant('workflow_modal_change_view_confirm'))) {
                this.hasModification = false;
                this.selected = newView;
            }
            return;
        }
        if (newView === 'permissions') {
            this.groups = cloneDeep(this.node.groups);
        }
        this.hasModification = false;
        this.selected = newView;
    }
}