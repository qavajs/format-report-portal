@data_table
@multiline
Feature: DataTable and Multiline

  Background:
    Given background

  Scenario: data table
    When data table step
      | column1 | column2 |
      | value1  | value2  |
    And passed step

  Scenario: multiline text
    When multiline step
    """
    this
    is
    multiline
    text
    """
    And passed step
