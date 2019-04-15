import {Component, Input, OnInit} from '@angular/core';
import {Store} from '@ngxs/store';
import {cloneDeep} from 'lodash';
import {finalize, first} from 'rxjs/operators';
import {AutoUnsubscribe} from '../../../decorator/autoUnsubscribe';
import {WNode, Workflow} from '../../../../model/workflow.model';
import {IdName, Project} from '../../../../model/project.model';
import {Environment} from '../../../../model/environment.model';
import {PermissionValue} from '../../../../model/permission.model';
import {ApplicationService} from 'app/service/application/application.service';
import {UpdateWorkflow} from 'app/store/workflows.action';
import {TranslateService} from '@ngx-translate/core';
import {ToastService} from 'app/shared/toast/ToastService';

@Component({
    selector: 'app-workflow-node-context',
    templateUrl: './wizard.context.html',
    styleUrls: ['./wizard.context.scss']
})
@AutoUnsubscribe()
export class WorkflowWizardNodeContextComponent implements OnInit {

    @Input() project: Project;
    @Input() workflow: Workflow;
    editableNode: WNode;
    @Input('node') set node(data: WNode) {
        if (data) {
            this.editableNode = cloneDeep(data);
        }
    };
    get node(): WNode {
        return this.editableNode;
    }
    environments: Environment[];
    applications: IdName[];
    integrations: Array<IdName>;
    permissionEnum = PermissionValue;
    loading: boolean;

    constructor(private store: Store, private _appService: ApplicationService, private _translate: TranslateService,
                private _toast: ToastService) {}

    ngOnInit() {
        let voidEnv = new Environment();
        voidEnv.id = 0;
        voidEnv.name = ' ';
        this.environments = cloneDeep(this.project.environments) || [];
        this.environments.unshift(voidEnv);

        let voidApp = new IdName();
        voidApp.id = 0;
        voidApp.name = ' ';
        this.applications = cloneDeep(this.project.application_names) || [];
        this.applications.unshift(voidApp);
    }

    initIntegrationList(): void {
        let voidPF = new IdName();
        voidPF.id = 0;
        voidPF.name = '';
        this.integrations.unshift(voidPF);
    }

    change(): void {
        this.node.context.application_id = Number(this.node.context.application_id);
        this.node.context.environment_id = Number(this.node.context.environment_id);
        this.node.context.pipeline_id = Number(this.node.context.pipeline_id);

        let appName = this.applications.find(k => Number(k.id) === this.node.context.application_id).name
        if (appName && appName !== ' ') {
            this._appService.getDeploymentStrategies(this.project.key, appName).pipe(
                first(),
                finalize(() => this.initIntegrationList())
            ).subscribe(
                data => {
                    this.integrations = [];
                    let pfNames = Object.keys(data);
                    pfNames.forEach(s => {
                        let pf = this.project.integrations.find(p => p.name === s);
                        if (pf) {
                            let idName = new IdName();
                            idName.id = pf.id;
                            idName.name = pf.name;
                            this.integrations.push(idName);
                        }
                    })
                }
            )
        } else {
            this.integrations = [];
            this.initIntegrationList();
            this.node.context.project_integration_id = 0;
        }
    }

    updateWorkflow(): void {
        this.loading = true;
        let clonedWorkflow = cloneDeep(this.workflow);
        let n = Workflow.getNodeByID(this.editableNode.id, clonedWorkflow);
        n.context.application_id = this.editableNode.context.application_id;
        n.context.environment_id = this.editableNode.context.environment_id;
        n.context.project_integration_id = this.editableNode.context.project_integration_id;
        n.context.mutex = this.editableNode.context.mutex;
        this.store.dispatch(new UpdateWorkflow({
            projectKey: this.workflow.project_key,
            workflowName: this.workflow.name,
            changes: clonedWorkflow
        })).pipe(finalize(() => this.loading = false))
            .subscribe(() => {
                this._toast.success('', this._translate.instant('permission_updated'));
            });
    }
}
