import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {TranslateService} from '@ngx-translate/core';
import {Store} from '@ngxs/store';
import {PermissionValue} from 'app/model/permission.model';
import {Project} from 'app/model/project.model';
import {WNode, Workflow} from 'app/model/workflow.model';
import {PermissionEvent} from 'app/shared/permission/permission.event.model';
import {ToastService} from 'app/shared/toast/ToastService';
import {CleanWorkflowNodeModal} from 'app/store/node.modal.action';
import {NodeModalState, NodeModalStateModel} from 'app/store/node.modal.state';
import {UpdateWorkflow} from 'app/store/workflows.action';
import {cloneDeep} from 'lodash';
import {ModalSize, ModalTemplate, SuiModalService, TemplateModalConfig} from 'ng2-semantic-ui';
import {ActiveModal} from 'ng2-semantic-ui/dist';
import {finalize} from 'rxjs/operators';

@Component({
    selector: 'app-node-edit-modal',
    templateUrl: './node.edit.modal.html',
    styleUrls: ['./node.edit.modal.scss']
})
export class WorkflowNodeEditModalComponent implements OnInit {

    @Input() project: Project;
    @Input() workflow: Workflow;
    _node: WNode;
    @Input('node') set node(data: WNode) {
        this._node = data;
    }
    get node() {
        return this._node;
    }

    @ViewChild('nodeEditModal')
    public nodeEditModal: ModalTemplate<boolean, boolean, void>;
    modal: ActiveModal<boolean, boolean, void>;
    modalConfig: TemplateModalConfig<boolean, boolean, void>;

    selected: string;

    permissionEnum = PermissionValue;
    loading = false;

    constructor(private _modalService: SuiModalService, private _store: Store,
                private _translate: TranslateService, private _toast: ToastService) {
    }

    ngOnInit(): void {
        this._store.select(NodeModalState.getCurrent()).subscribe( (s: NodeModalStateModel) => {
            if (s.node) {
                this.project = s.project;
                this.workflow = s.workflow;
                let open = this.node != null;
                this.node = cloneDeep(s.node);
                if (!this.selected) {
                    switch (this.node.type) {
                        case 'outgoinghook':
                            this.selected = 'outgoinghook';
                            break;
                        default:
                            this.selected = 'context';
                    }
                }
                if (!open) {
                    this.show();
                }
            } else if (this.modal) {
                delete this.node;
                delete this.selected;
                this.modal.approve(true);
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
                this._store.dispatch(new CleanWorkflowNodeModal({}));
            });
            this.modal.onDeny(() => {
                this._store.dispatch(new CleanWorkflowNodeModal({}));
            });
        } else {
            this.modal = this._modalService.open(this.modalConfig);
            this.modal.onApprove(() => {
                this._store.dispatch(new CleanWorkflowNodeModal({}));
            });
            this.modal.onDeny(() => {
                this._store.dispatch(new CleanWorkflowNodeModal({}));
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
                event.gp.updating = false;
                this._toast.success('', this._translate.instant('permission_updated'));
            });
    }

}