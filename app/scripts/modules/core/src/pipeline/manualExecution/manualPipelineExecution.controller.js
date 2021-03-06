'use strict';

const angular = require('angular');
import _ from 'lodash';

import { AUTHENTICATION_SERVICE } from 'core/authentication/authentication.service';
import { PIPELINE_CONFIG_PROVIDER } from 'core/pipeline/config/pipelineConfigProvider';

import './manualPipelineExecution.less';

module.exports = angular.module('spinnaker.core.pipeline.manualPipelineExecution.controller', [
  require('angular-ui-bootstrap'),
  PIPELINE_CONFIG_PROVIDER,
  require('../../notification/notification.service').name,
  AUTHENTICATION_SERVICE
])
  .controller('ManualPipelineExecutionCtrl', function ($uibModalInstance, pipeline, application, pipelineConfig,
                                                       notificationService, authenticationService) {

    let applicationNotifications = [];
    let pipelineNotifications = [];

    this.notificationTooltip = require('./notifications.tooltip.html');

    notificationService.getNotificationsForApplication(application.name).then(notifications => {
      Object.keys(notifications).sort().filter(k => Array.isArray(notifications[k])).forEach(type => {
        notifications[type].forEach(notification => {
          applicationNotifications.push(notification);
        });
      });
      synchronizeNotifications();
    });

    let user = authenticationService.getAuthenticatedUser();

    let synchronizeNotifications = () => {
      this.notifications = applicationNotifications.concat(pipelineNotifications);
    };

    this.getNotifications = () => {
      return _.has(this.command, 'pipeline.notifications') ?
        this.command.pipeline.notifications.concat(applicationNotifications) :
        applicationNotifications;
    };

    let userEmail = user.authenticated && user.name.includes('@') ? user.name : null;

    this.command = {
      pipeline: pipeline,
      trigger: null,
      dryRunEnabled: false,
      notificationEnabled: false,
      notification: {
        type: 'email',
        address: userEmail,
        when: [
          'pipeline.complete',
          'pipeline.failed'
        ]
      }
    };

    let addTriggers = () => {
      let pipeline = this.command.pipeline;
      if (!pipeline || !pipeline.triggers || !pipeline.triggers.length) {
        this.command.trigger = null;
        return;
      }

      this.triggers = pipeline.triggers
        .filter((trigger) => pipelineConfig.hasManualExecutionHandlerForTriggerType(trigger.type))
        .map((trigger) => {
          let copy = _.clone(trigger);
          copy.description = '...'; // placeholder
          pipelineConfig.getManualExecutionHandlerForTriggerType(trigger.type)
            .formatLabel(trigger).then((label) => copy.description = label);
          return copy;
        });

      this.command.trigger = _.head(this.triggers);
    };


    /**
     * Controller API
     */

    this.triggerUpdated = (trigger) => {
      let command = this.command;

      if( trigger !== undefined ) {
        command.trigger = trigger;
      }

      if (command.trigger) {
        this.triggerTemplate = pipelineConfig.getManualExecutionHandlerForTriggerType(command.trigger.type)
          .selectorTemplate;
      }
    };

    this.pipelineSelected = () => {
      let pipeline = this.command.pipeline,
          executions = application.executions.data || [];

      pipelineNotifications = pipeline.notifications || [];
      synchronizeNotifications();

      this.currentlyRunningExecutions = executions
        .filter((execution) => execution.pipelineConfigId === pipeline.id && execution.isActive);
      addTriggers();
      this.triggerUpdated();

      const additionalTemplates = pipeline.stages.map(stage => pipelineConfig.getManualExecutionHandlerForStage(stage));
      this.stageTemplates = _.uniq(_.compact(additionalTemplates));

      if (pipeline.parameterConfig && pipeline.parameterConfig.length) {
        this.parameters = {};
        this.hasRequiredParameters = pipeline.parameterConfig.some(p => p.required);
        pipeline.parameterConfig.forEach((parameter) => {
          this.parameters[parameter.name] = parameter.default;
        });
      }

    };

    this.execute = () => {
      let selectedTrigger = this.command.trigger || {},
          command = { trigger: selectedTrigger },
          pipeline = this.command.pipeline;

      if (this.command.notificationEnabled && this.command.notification.address) {
        selectedTrigger.notifications = [this.command.notification];
      }

      // include any extra data populated by trigger manual execution handlers
      angular.extend(selectedTrigger, this.command.extraFields);

      command.pipelineName = pipeline.name;
      selectedTrigger.type = this.command.dryRunEnabled ? 'dryrun' : 'manual';

      if (pipeline.parameterConfig && pipeline.parameterConfig.length) {
        selectedTrigger.parameters = this.parameters;
      }
      $uibModalInstance.close(command);
    };

    this.cancel = $uibModalInstance.dismiss;

    this.hasStageOf = (stageType) => {
      return this.getStagesOf(stageType).length > 0;
    };

    this.getStagesOf = (stageType) => {
      if (!this.command.pipeline) {
        return [];
      }
      return this.command.pipeline.stages.filter( stage => stage.type === stageType);
    };

    /**
     * Initialization
     */

    if (pipeline) {
      this.pipelineSelected();
    }

    if (!pipeline) {
      this.pipelineOptions = application.pipelineConfigs.data.filter(c => !c.disabled);
    }

  });
