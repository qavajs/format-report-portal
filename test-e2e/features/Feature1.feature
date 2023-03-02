Feature: Feature1

  Background:
    Given background

  Scenario: scenario passed
    When passed step

  Scenario: scenario failed
    When passed step
    And failed step
    And passed step

  Scenario: scenario undefined
    When passed step
    And undefined step

  Scenario: scenario ambiguous
    When passed step
    And ambiguous step

  Scenario: scenario pending
    When passed step
    And pending step

  @there @is @too @many @tags @first_tag @second_tag @third_tag
  @fourth_tag @fifth_tag @and_so_on @etc
  @more_words @that @not @fit @to @the @scenario @title @panel
  Scenario: too many tags scenario that does not fit to the title
    When passed step

  Scenario: some name
    When passed step

  Scenario: some name
    When failed step
