// Copyright 2020 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Component for the feature tab on the release coordinator page.
 */

import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import { downgradeComponent } from '@angular/upgrade/static';

import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import { Subscription } from 'rxjs';

import { AdminFeaturesTabConstants } from
  'pages/release-coordinator-page/features-tab/features-tab.constants';
import { LoaderService } from 'services/loader.service';
import { WindowRef } from 'services/contextual/window-ref.service';
import { PlatformFeatureAdminBackendApiService } from
  'domain/platform_feature/platform-feature-admin-backend-api.service';
import { PlatformFeatureDummyBackendApiService } from
  'domain/platform_feature/platform-feature-dummy-backend-api.service';
import { PlatformFeatureService } from 'services/platform-feature.service';
import {
  PlatformParameterFilterType,
  PlatformParameterFilter,
} from 'domain/platform_feature/platform-parameter-filter.model';
import { PlatformParameter } from
  'domain/platform_feature/platform-parameter.model';
import { PlatformParameterRule } from
  'domain/platform_feature/platform-parameter-rule.model';
import { HttpErrorResponse } from '@angular/common/http';

type FilterType = keyof typeof PlatformParameterFilterType;

@Component({
  selector: 'features-tab',
  templateUrl: './features-tab.component.html'
})
export class FeaturesTabComponent implements OnInit {
  @Output() setStatusMessage = new EventEmitter<string>();

  readonly availableFilterTypes: PlatformParameterFilterType[] = Object
    .keys(PlatformParameterFilterType)
    .map(key => {
      var filterType = key as FilterType;
      return PlatformParameterFilterType[filterType];
    });

  readonly filterTypeToContext: {
    [key in PlatformParameterFilterType]: {
      displayName: string;
      operators: readonly string[];
      options?: readonly string[];
      optionFilter?: (feature: PlatformParameter, option: string) => boolean;
      placeholder?: string;
      inputRegex?: RegExp;
    }
  } = {
      [PlatformParameterFilterType.PlatformType]: {
        displayName: 'Platform Type',
        options: AdminFeaturesTabConstants.ALLOWED_PLATFORM_TYPES,
        operators: ['=']
      },
      [PlatformParameterFilterType.AppVersion]: {
        displayName: 'App Version',
        operators: ['=', '<', '>', '<=', '>='],
        placeholder: 'e.g. 1.0.0',
        inputRegex: AdminFeaturesTabConstants.APP_VERSION_REGEXP
      },
      [PlatformParameterFilterType.AppVersionFlavor]: {
        displayName: 'App Version Flavor',
        options: AdminFeaturesTabConstants.ALLOWED_APP_VERSION_FLAVORS,
        operators: ['=', '<', '>', '<=', '>=']
      }
    };

  private readonly defaultNewFilter: PlatformParameterFilter = (
    PlatformParameterFilter.createFromBackendDict({
      type: PlatformParameterFilterType.PlatformType,
      conditions: []
    })
  );

  private readonly defaultNewRule: PlatformParameterRule = (
    PlatformParameterRule.createFromBackendDict({
      filters: [this.defaultNewFilter.toBackendDict()],
      value_when_matched: false
    })
  );

  DEV_SERVER_STAGE = 'dev';
  TEST_SERVER_STAGE = 'test';
  PROD_SERVER_STAGE = 'prod';
  serverStage: string = '';

  // These properties are initialized using Angular lifecycle hooks
  // and we need to do non-null assertion. For more information, see
  // https://github.com/oppia/oppia/wiki/Guide-on-defining-types#ts-7-1
  featureFlagNameToBackupMap!: Map<string, PlatformParameter>;
  featureFlags: PlatformParameter[] = [];
  featureFlagsAreFetched: boolean = false;
  isDummyApiEnabled: boolean = false;
  loadingMessage: string = '';
  directiveSubscriptions = new Subscription();

  constructor(
    private windowRef: WindowRef,
    private apiService: PlatformFeatureAdminBackendApiService,
    private featureService: PlatformFeatureService,
    private dummyApiService: PlatformFeatureDummyBackendApiService,
    private loaderService: LoaderService,
  ) {}

  async reloadFeatureFlagsAsync(): Promise<void> {
    const data = await this.apiService.getFeatureFlags();
    this.serverStage = data.serverStage;
    this.featureFlagsAreFetched = true;
    this.featureFlags = data.featureFlags;
    this.featureFlagNameToBackupMap = new Map(
      this.featureFlags.map(feature => [feature.name, cloneDeep(feature)]));
    this.loaderService.hideLoadingScreen();
  }

  addNewRuleToTop(feature: PlatformParameter): void {
    feature.rules.unshift(cloneDeep(this.defaultNewRule));
  }

  addNewRuleToBottom(feature: PlatformParameter): void {
    feature.rules.push(cloneDeep(this.defaultNewRule));
  }

  addNewFilter(rule: PlatformParameterRule): void {
    rule.filters.push(cloneDeep(this.defaultNewFilter));
  }

  addNewCondition(filter: PlatformParameterFilter): void {
    const context = this.filterTypeToContext[filter.type];
    filter.conditions.push([
      context.operators[0],
      context.options ? context.options[0] : ''
    ]);
  }

  removeRule(feature: PlatformParameter, ruleIndex: number): void {
    feature.rules.splice(ruleIndex, 1);
  }

  removeFilter(rule: PlatformParameterRule, filterIndex: number): void {
    rule.filters.splice(filterIndex, 1);
  }

  removeCondition(
      filter: PlatformParameterFilter, conditionIndex: number): void {
    filter.conditions.splice(conditionIndex, 1);
  }

  moveRuleUp(feature: PlatformParameter, ruleIndex: number): void {
    const rule = feature.rules[ruleIndex];
    this.removeRule(feature, ruleIndex);
    feature.rules.splice(ruleIndex - 1, 0, rule);
  }

  moveRuleDown(feature: PlatformParameter, ruleIndex: number): void {
    const rule = feature.rules[ruleIndex];
    this.removeRule(feature, ruleIndex);
    feature.rules.splice(ruleIndex + 1, 0, rule);
  }

  getFeatureValidOnCurrentServer(feature: PlatformParameter): boolean {
    if (this.serverStage === this.DEV_SERVER_STAGE) {
      return true;
    } else if (this.serverStage === this.TEST_SERVER_STAGE) {
      return (
        feature.featureStage === this.TEST_SERVER_STAGE ||
        feature.featureStage === this.PROD_SERVER_STAGE
      ) ? true : false;
    } else if (this.serverStage === this.PROD_SERVER_STAGE) {
      return feature.featureStage === this.PROD_SERVER_STAGE ? true : false;
    }
    return false;
  }

  async saveDefaultValueToStorage(): Promise<void> {
    if (!this.windowRef.nativeWindow.confirm(
      'This action is irreversible.')) {
      return;
    }
    for (let feature of this.featureFlags) {
      let commitMessage = `Update default value for '${feature.name}'.`;
      await this.updateFeatureFlag(feature, commitMessage);
    }
  }

  async updateFeatureFlag(
      feature: PlatformParameter, commitMessage: string): Promise<void> {
    try {
      await this.apiService.updateFeatureFlag(
        feature.name, commitMessage, feature.rules);

      this.featureFlagNameToBackupMap.set(feature.name, cloneDeep(feature));

      this.setStatusMessage.emit('Saved successfully.');
    // We use unknown type because we are unsure of the type of error
    // that was thrown. Since the catch block cannot identify the
    // specific type of error, we are unable to further optimise the
    // code by introducing more types of errors.
    } catch (e: unknown) {
      if (e instanceof HttpErrorResponse) {
        if (e.error && e.error.error) {
          this.setStatusMessage.emit(`Update failed: ${e.error.error}`);
        } else {
          this.setStatusMessage.emit('Update failed.');
        }
      } else {
        throw new Error('Unexpected error response.');
      }
    }
  }

  async updateFeatureRulesAsync(feature: PlatformParameter): Promise<void> {
    const issues = this.validateFeatureFlag(feature);
    if (issues.length > 0) {
      this.windowRef.nativeWindow.alert(issues.join('\n'));
      return;
    }
    const commitMessage = this.windowRef.nativeWindow.prompt(
      'This action is irreversible. If you insist to proceed, please enter ' +
      'the commit message for the update',
      `Update feature '${feature.name}'.`
    );
    if (commitMessage === null) {
      return;
    }

    await this.updateFeatureFlag(feature, commitMessage);
  }

  clearChanges(featureFlag: PlatformParameter): void {
    if (!this.windowRef.nativeWindow.confirm(
      'This will revert all changes you made. Are you sure?')) {
      return;
    }
    const backup = this.featureFlagNameToBackupMap.get(
      featureFlag.name
    );

    if (backup) {
      featureFlag.rules = cloneDeep(backup.rules);
    }
  }

  clearFilterConditions(filter: PlatformParameterFilter): void {
    filter.conditions.splice(0);
  }

  isFeatureFlagChanged(feature: PlatformParameter): boolean {
    const original = this.featureFlagNameToBackupMap.get(
      feature.name
    );
    if (original === undefined) {
      throw new Error('Backup not found for feature flag: ' + feature.name);
    }
    return !isEqual(original.rules, feature.rules);
  }

  /**
   * Validates feature flag before updating, checks if there are identical
   * rules, filters or conditions at the same level.
   *
   * @param {PlatformParameter} feature - the feature flag to be validated.
   *
   * @returns {string[]} - Array of issue messages, if any.
   */
  validateFeatureFlag(feature: PlatformParameter): string[] {
    const issues = [];

    const seenRules: PlatformParameterRule[] = [];
    for (const [ruleIndex, rule] of feature.rules.entries()) {
      const sameRuleIndex = seenRules.findIndex(
        seenRule => isEqual(seenRule, rule));
      if (sameRuleIndex !== -1) {
        issues.push(
          `The ${sameRuleIndex + 1}-th & ${ruleIndex + 1}-th rules are` +
          ' identical.');
        continue;
      }
      seenRules.push(rule);

      const seenFilters: PlatformParameterFilter[] = [];
      for (const [filterIndex, filter] of rule.filters.entries()) {
        const sameFilterIndex = seenFilters.findIndex(
          seenFilter => isEqual(seenFilter, filter));
        if (sameFilterIndex !== -1) {
          issues.push(
            `In the ${ruleIndex + 1}-th rule: the ${sameFilterIndex + 1}-th` +
            ` & ${filterIndex + 1}-th filters are identical.`);
          continue;
        }
        seenFilters.push(filter);

        const seenConditions: [string, string][] = [];
        for (const [conditionIndex, condition] of filter.conditions
          .entries()) {
          const sameCondIndex = seenConditions.findIndex(
            seenCond => isEqual(seenCond, condition));
          if (sameCondIndex !== -1) {
            issues.push(
              `In the ${ruleIndex + 1}-th rule, ${filterIndex + 1}-th` +
              ` filter: the ${sameCondIndex + 1}-th & ` +
              `${conditionIndex + 1}-th conditions are identical.`);
            continue;
          }

          seenConditions.push(condition);
        }
      }
    }
    return issues;
  }

  get dummyFeatureFlagForE2eTestsIsEnabled(): boolean {
    return this.featureService.status.DummyFeatureFlagForE2ETests.isEnabled;
  }

  async reloadDummyHandlerStatusAsync(): Promise<void> {
    if (this.dummyFeatureFlagForE2eTestsIsEnabled) {
      this.isDummyApiEnabled = await this.dummyApiService.isHandlerEnabled();
    }
  }

  ngOnInit(): void {
    this.directiveSubscriptions.add(
      this.loaderService.onLoadingMessageChange.subscribe(
        (message: string) => {
          this.loadingMessage = message;
        }
      ));
    this.loaderService.showLoadingScreen('Loading');
    this.reloadFeatureFlagsAsync();
    this.reloadDummyHandlerStatusAsync();
  }

  ngOnDestroy(): void {
    this.directiveSubscriptions.unsubscribe();
  }
}

angular.module('oppia').directive(
  'adminFeaturesTab', downgradeComponent(
    {component: FeaturesTabComponent}));
