import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {PermissionValue} from '@cds/model/permission.model';
import {WorkflowService} from '@cds/service/workflow/workflow.service';
import {Action, createSelector, State, StateContext} from '@ngxs/store';
import {GroupPermission} from 'app/model/group.model';
import {Label} from 'app/model/project.model';
import {WNode, WNodeHook, WNodeTrigger, Workflow} from 'app/model/workflow.model';
import {NavbarService} from 'app/service/navbar/navbar.service';
import {cloneDeep} from 'lodash';
import {first, tap} from 'rxjs/operators';
import * as ActionProject from './project.action';
import * as actionWorkflow from './workflow.action';
import {UpdateModal} from './workflow.action';

export class WorkflowStateModel {
    workflow: Workflow; // selected workflow
    projectKey: string; // current project key
    node: WNode; // selected node
    hook: WNodeHook; // selected hook
    editModal: boolean; // is edit modal is opened
    loading: boolean; // loading
    canEdit: boolean; // user permission
}

export function getInitialWorkflowState(): WorkflowStateModel {
    return {
        projectKey: null,
        workflow: null,
        node: null,
        hook: null,
        editModal: false,
        loading: true,
        canEdit: false
    };
}

@State<WorkflowStateModel>({
    name: 'workflow',
    defaults: getInitialWorkflowState()
})
export class WorkflowState {

    static getCurrent() {
        return createSelector(
            [WorkflowState],
            (state: WorkflowStateModel): WorkflowStateModel => state
        );
    }

    constructor(private _http: HttpClient, private _navbarService: NavbarService,
                private _workflowService: WorkflowService) {
    }

    @Action(actionWorkflow.OpenEditModal)
    openEditModal(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.OpenEditModal) {
        const state = ctx.getState();

        ctx.setState({
            ...state,
            node: action.payload.node,
            hook: action.payload.hook,
            editModal: true,
        });
    }

    @Action(actionWorkflow.CloseEditModal)
    closeEditModal(ctx: StateContext<WorkflowStateModel>) {
        const state = ctx.getState();
        ctx.setState({
            ...state,
            node: null,
            hook: null,
            editModal: false
        })
    }

    @Action(actionWorkflow.CreateWorkflow)
    create(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.CreateWorkflow) {
        const state = ctx.getState();
        return this._http.post<Workflow>(
            `/project/${action.payload.projectKey}/workflows`,
            action.payload.workflow
        ).pipe(tap((wf) => {
            ctx.setState({
                ...state,
                projectKey: action.payload.projectKey,
                workflow: wf,
                canEdit: true,
                loading: false
            });
            ctx.dispatch(new ActionProject.AddWorkflowInProject(wf));
        }));
    }

    @Action(actionWorkflow.ImportWorkflow)
    import(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.ImportWorkflow) {
        const state = ctx.getState();

        // Refresh when change project
        if (state.projectKey !== action.payload.projectKey) {
            ctx.setState({
                ...state,
                projectKey: action.payload.projectKey,
                workflow: null,
                loading: false,
            });
        }

        let headers = new HttpHeaders();
        headers = headers.append('Content-Type', 'application/x-yaml');
        let params = new HttpParams();
        params = params.append('format', 'yaml');

        let request = this._http.post<Array<string>>(
            `/project/${action.payload.projectKey}/import/workflows`,
            action.payload.workflowCode,
            {headers, params}
        );
        if (action.payload.wfName) {
            request = this._http.put<Array<string>>(
                `/project/${action.payload.projectKey}/import/workflows/${action.payload.wfName}`,
                action.payload.workflowCode,
                {headers, params}
            );
        }

        return request.pipe(tap(() => {
            if (action.payload.wfName) {
                return ctx.dispatch(new actionWorkflow.GetWorkflow({
                    projectKey: action.payload.projectKey,
                    workflowName: action.payload.wfName
                }));
            }
        }));

    }

    @Action(actionWorkflow.UpdateWorkflow)
    update(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateWorkflow) {
        return this._http.put<Workflow>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}`,
            action.payload.changes
        ).pipe(tap((wf) => {
            const state = ctx.getState();
            let oldWorkflow = cloneDeep(state.workflow);
            if (oldWorkflow.name !== wf.name) {
                wf.audits = cloneDeep(oldWorkflow.audits);
                wf.from_template = cloneDeep(oldWorkflow.from_template);
                wf.template_up_to_date = cloneDeep(oldWorkflow.template_up_to_date);
                wf.as_code_events = cloneDeep(oldWorkflow.as_code_events);

                ctx.setState({
                    ...state,
                    workflow: wf,
                });
                ctx.dispatch(new ActionProject.UpdateWorkflowInProject({
                    previousWorkflowName: action.payload.workflowName,
                    changes: wf
                }));
                ctx.dispatch(new UpdateModal({workflow: wf}));
            } else {
                let wfUpdated: Workflow = {
                    ...state.workflow,
                    ...wf,
                    preview: null
                };
                if (!wf.notifications) {
                    wfUpdated.notifications = [];
                }
                wfUpdated.audits = state.workflow.audits;
                wfUpdated.from_template = state.workflow.from_template;
                wfUpdated.template_up_to_date = state.workflow.template_up_to_date;
                wfUpdated.as_code_events = state.workflow.as_code_events;

                ctx.setState({
                    ...state,
                    workflow: wf,
                });
                ctx.dispatch(new UpdateModal({workflow: wf}));
            }
        }));
    }

    @Action(actionWorkflow.DeleteWorkflow)
    delete(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.DeleteWorkflow) {
        return this._http.delete(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}`
        ).pipe(tap(() => {
            const state = ctx.getState();
            ctx.setState({
                ...state,
                workflow: null,
                editModal: false,
                hook: null,
                node: null,
                loading: false,
                canEdit: false
            });

            ctx.dispatch(new ActionProject.DeleteWorkflowInProject({workflowName: action.payload.workflowName}));
        }));
    }

    @Action(actionWorkflow.UpdateWorkflowIcon)
    updateIcon(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateWorkflowIcon) {
        return this._http.put<null>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/icon`,
            action.payload.icon
        ).pipe(tap(() => {
            const state = ctx.getState();
            let wfUpdated = {
                ...state.workflow,
                icon: action.payload.icon
            };

            ctx.dispatch(new ActionProject.UpdateWorkflowInProject({
                previousWorkflowName: action.payload.workflowName,
                changes: wfUpdated
            }));

            return ctx.setState({
                ...state,
                workflow: wfUpdated,
            });
        }));
    }

    @Action(actionWorkflow.DeleteWorkflowIcon)
    deleteIcon(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.DeleteWorkflowIcon) {
        return this._http.delete<null>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/icon`
        ).pipe(tap(() => {
            const state = ctx.getState();
            let wfUpdated = {
                ...state.workflow,
                icon: ''
            };

            ctx.dispatch(new ActionProject.UpdateWorkflowInProject({
                previousWorkflowName: action.payload.workflowName,
                changes: wfUpdated
            }));

            return ctx.setState({
                ...state,
                workflow: wfUpdated,
            });
        }));
    }

    //  ------- Group Permission --------- //
    @Action(actionWorkflow.AddGroupInAllWorkflows)
    propagateProjectPermission(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.AddGroupInAllWorkflows) {
        const state = ctx.getState();
        let group: GroupPermission = {...action.payload.group, hasChanged: false, updating: false};
        let wf = Object.assign({}, state.workflow, <Workflow>{
            groups: [group].concat(state.workflow.groups)
        });

        ctx.setState({
            ...state,
            workflow: wf,
        });
    }

    @Action(actionWorkflow.AddGroupInWorkflow)
    addGroupPermission(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.AddGroupInWorkflow) {
        return this._http.post<Workflow>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/groups`,
            action.payload.group
        ).pipe(tap((wf: Workflow) => {
            const state = ctx.getState();
            ctx.setState({
                ...state,
                workflow: Object.assign({}, state.workflow, <Workflow>{groups: wf.groups}),
            });
        }));
    }

    @Action(actionWorkflow.UpdateGroupInWorkflow)
    updateGroupPermission(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateGroupInWorkflow) {
        return this._http.put<Workflow>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/groups/${action.payload.group.group.name}`,
            action.payload.group
        ).pipe(tap((wf: Workflow) => {
            const state = ctx.getState();
            ctx.setState({
                ...state,
                workflow: Object.assign({}, state.workflow, <Workflow>{groups: wf.groups}),
            });
        }));
    }

    @Action(actionWorkflow.DeleteGroupInWorkflow)
    deleteGroupPermission(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.DeleteGroupInWorkflow) {
        return this._http.delete<Workflow>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/groups/${action.payload.group.group.name}`
        ).pipe(tap((wf: Workflow) => {
            const state = ctx.getState();
            ctx.setState({
                ...state,
                workflow: Object.assign({}, state.workflow, <Workflow>{groups: wf.groups}),
            });
        }));
    }

    //  ------- Notification --------- //
    @Action(actionWorkflow.AddNotificationWorkflow)
    addNotification(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.AddNotificationWorkflow) {
        const state = ctx.getState();
        const notifications = state.workflow.notifications || [];
        const workflow: Workflow = {
            ...state.workflow,
            notifications: notifications.concat([action.payload.notification])
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    @Action(actionWorkflow.UpdateNotificationWorkflow)
    updateNotification(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateNotificationWorkflow) {
        const state = ctx.getState();
        const workflow: Workflow = {
            ...state.workflow,
            notifications: state.workflow.notifications.map((no) => {
                if (no.id === action.payload.notification.id) {
                    return action.payload.notification;
                }
                return no;
            })
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    @Action(actionWorkflow.DeleteNotificationWorkflow)
    deleteNotification(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.DeleteNotificationWorkflow) {
        const state = ctx.getState();
        const workflow: Workflow = {
            ...state.workflow,
            notifications: state.workflow.notifications.filter(no => {
                return action.payload.notification.id !== no.id;
            })
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    //  ------- Nodes --------- //
    @Action(actionWorkflow.AddNodeTriggerWorkflow)
    addNodeTrigger(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.AddNodeTriggerWorkflow) {
        const state = ctx.getState();
        let currentWorkflow = cloneDeep(state.workflow);
        let node = Workflow.getNodeByID(action.payload.parentId, currentWorkflow);
        if (!node.triggers) {
            node.triggers = new Array<WNodeTrigger>();
        }
        node.triggers.push(action.payload.trigger);

        const workflow: Workflow = {
            ...state.workflow,
            workflow_data: {
                ...state.workflow.workflow_data,
                node: currentWorkflow.workflow_data.node
            }
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    //  ------- Joins --------- //
    @Action(actionWorkflow.AddJoinWorkflow)
    addJoinTrigger(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.AddJoinWorkflow) {
        const state = ctx.getState();
        let joins = state.workflow.workflow_data.joins ? [...state.workflow.workflow_data.joins] : [];
        joins.push(action.payload.join);

        const workflow: Workflow = {
            ...state.workflow,
            workflow_data: {
                ...state.workflow.workflow_data,
                joins
            }
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    //  ------- Hooks --------- //
    @Action(actionWorkflow.AddHookWorkflow)
    addHook(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.AddHookWorkflow) {
        const state = ctx.getState();
        const hooks = state.workflow.workflow_data.node.hooks || [];
        const root = Object.assign({}, state.workflow.workflow_data.node, <WNode>{
            hooks: hooks.concat([action.payload.hook])
        });
        const workflow: Workflow = {
            ...state.workflow,
            workflow_data: {
                ...state.workflow.workflow_data,
                node: root
            }
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    @Action(actionWorkflow.UpdateHookWorkflow)
    updateHook(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateHookWorkflow) {
        const state = ctx.getState();
        const root = Object.assign({}, state.workflow.workflow_data.node, <WNode>{
            hooks: state.workflow.workflow_data.node.hooks.map((hook) => {
                if (hook.uuid === action.payload.hook.uuid) {
                    return action.payload.hook;
                }
                return hook;
            })
        });
        const workflow: Workflow = {
            ...state.workflow,
            workflow_data: {
                ...state.workflow.workflow_data,
                node: root
            }
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    @Action(actionWorkflow.DeleteHookWorkflow)
    deleteHook(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.DeleteHookWorkflow) {
        const state = ctx.getState();
        const root = Object.assign({}, state.workflow.workflow_data.node, <WNode>{
            hooks: state.workflow.workflow_data.node.hooks.filter((hook) => hook.uuid !== action.payload.hook.uuid)
        });
        const workflow: Workflow = {
            ...state.workflow,
            workflow_data: {
                ...state.workflow.workflow_data,
                node: root
            }
        };

        return ctx.dispatch(new actionWorkflow.UpdateWorkflow({
            projectKey: action.payload.projectKey,
            workflowName: action.payload.workflowName,
            changes: workflow
        }));
    }

    //  ------- Audit --------- //
    @Action(actionWorkflow.FetchWorkflowAudits)
    fetchAudits(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.FetchWorkflowAudits) {
        const state = ctx.getState();

        if (!state.workflow || !state.workflow.audits) {
            return ctx.dispatch(new actionWorkflow.GetWorkflow({
                projectKey: action.payload.projectKey,
                workflowName: action.payload.workflowName,
            }));
        }
    }

    @Action(actionWorkflow.RollbackWorkflow)
    rollback(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.RollbackWorkflow) {
        let auditId = action.payload.auditId;
        return this._http.post<Workflow>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/rollback/${auditId}`,
            {}
        ).pipe(tap((workflow: Workflow) => {
            const state = ctx.getState();
            ctx.setState({
                ...state,
                workflow: workflow,
            });
            return ctx.dispatch(new actionWorkflow.FetchWorkflowAudits({
                projectKey: action.payload.projectKey,
                workflowName: workflow.name
            }));
        }));
    }

    //  ------- Labels --------- //
    @Action(actionWorkflow.LinkLabelOnWorkflow)
    linkLabel(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.LinkLabelOnWorkflow) {
        return this._http.post<Label>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/label`,
            action.payload.label
        ).pipe(tap((label: Label) => {
            const state = ctx.getState();

            ctx.dispatch(new ActionProject.AddLabelWorkflowInProject({
                workflowName: action.payload.workflowName,
                label: action.payload.label
            }));
            if (state.workflow) {
                const labels = state.workflow.labels ? state.workflow.labels.concat(label) : [label];
                ctx.setState({
                    ...state,
                    workflow: Object.assign({}, state.workflow, <Workflow>{
                        labels
                    }),
                });
            }
        }));
    }

    @Action(actionWorkflow.UnlinkLabelOnWorkflow)
    unlinkLabel(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UnlinkLabelOnWorkflow) {
        return this._http.delete<null>(
            `/project/${action.payload.projectKey}/workflows/${action.payload.workflowName}/label/${action.payload.label.id}`
        ).pipe(tap(() => {
            const state = ctx.getState();

            ctx.dispatch(new ActionProject.DeleteLabelWorkflowInProject({
                workflowName: action.payload.workflowName,
                labelId: action.payload.label.id
            }));
            if (state.workflow) {
                let labels = state.workflow.labels ? state.workflow.labels.concat([]) : [];
                labels = labels.filter((lbl) => lbl.id !== action.payload.label.id);

                ctx.setState({
                    ...state,
                    workflow: Object.assign({}, state.workflow, <Workflow>{
                        labels
                    }),
                });
            }
        }));
    }

    //  ------- Misc --------- //
    @Action(actionWorkflow.FetchAsCodeWorkflow)
    fetchAsCode(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.FetchAsCodeWorkflow) {
        let params = new HttpParams();
        params = params.append('format', 'yaml');

        return this._http.get<string>(
            `/project/${action.payload.projectKey}/export/workflows/${action.payload.workflowName}`,
            {params, responseType: <any>'text'}
        ).pipe(tap((asCode: string) => {
            const state = ctx.getState();

            ctx.setState({
                ...state,
                workflow: Object.assign({}, state.workflow, <Workflow>{asCode}),
            });
        }));
    }

    @Action(actionWorkflow.PreviewWorkflow)
    preview(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.PreviewWorkflow) {
        let headers = new HttpHeaders();
        headers = headers.append('Content-Type', 'application/x-yaml');
        let params = new HttpParams();
        params = params.append('format', 'yaml');

        return this._http.post<Workflow>(
            `/project/${action.payload.projectKey}/preview/workflows`,
            action.payload.wfCode,
            {params, headers}
        ).pipe(tap((wf: Workflow) => {
            const state = ctx.getState();
            ctx.setState({
                ...state,
                workflow: Object.assign({}, state.workflow, {preview: wf})
            });
        }));
    }

    @Action(actionWorkflow.ExternalChangeWorkflow)
    externalChange(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.ExternalChangeWorkflow) {
        const state = ctx.getState();
        ctx.setState({
            ...state,
            workflow: Object.assign({}, state.workflow, {externalChange: true}),
        });
    }

    @Action(actionWorkflow.GetWorkflow)
    resync(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.GetWorkflow) {
        return this._workflowService.getWorkflow(action.payload.projectKey, action.payload.workflowName).pipe(first(),
            tap(wf => {
                const state = ctx.getState();
                ctx.setState({
                    ...state,
                    projectKey: action.payload.projectKey,
                    workflow: wf,
                    canEdit: wf.permission === PermissionValue.READ_WRITE_EXECUTE
                });
            }));
    }

    @Action(actionWorkflow.UpdateFavoriteWorkflow)
    updateFavorite(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateFavoriteWorkflow) {
        const state = ctx.getState();

        return this._http.post(
            '/user/favorite', {
                type: 'workflow',
                project_key: action.payload.projectKey,
                workflow_name: action.payload.workflowName,
            }
        ).pipe(tap(() => {
            this._navbarService.getData(); // TODO: to delete
            if (state.workflow) {
                ctx.setState({
                    ...state,
                    workflow: Object.assign({}, state.workflow, <Workflow>{
                        favorite: !state.workflow.favorite
                    })
                });
            }
            // TODO: dispatch action on global state to update project in list and user state
            // TODO: move this one on user state and just update state here, not XHR
        }));
    }

    @Action(actionWorkflow.UpdateModal)
    updateModal(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.UpdateModal) {
        const state = ctx.getState();
        let node;
        let hook;
        if (state.node) {
            node = Workflow.getNodeByRef(state.node.ref, action.payload.workflow);
        }
        if (state.hook) {
            hook = Workflow.getHookByRef(state.hook.ref, action.payload.workflow);
        }
        ctx.setState({
            ...state,
            node: node,
            hook: hook
        });
    }

    @Action(actionWorkflow.CleanWorkflowState)
    clearCache(ctx: StateContext<WorkflowStateModel>, action: actionWorkflow.CleanWorkflowState) {
        ctx.setState(getInitialWorkflowState());
    }
}