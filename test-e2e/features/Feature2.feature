@feature_tag
Feature: Feature2

  Background:
    Given background

  @scenario_tag
  Scenario: scenario passed in feature 2
    When passed step

  Scenario: scenario failed in feature 2
    When passed step
    And failed step

  Scenario: second scenario failed in feature 2
    When passed step
    And failed step

