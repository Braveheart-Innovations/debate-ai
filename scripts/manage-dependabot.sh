#!/bin/bash

# Script to manage Dependabot PRs

echo "Dependabot PR Management"
echo "========================"

# List all Dependabot PRs
echo "Current Dependabot PRs:"
gh pr list --author app/dependabot --json number,title,state | jq -r '.[] | "\(.number): \(.title)"'

echo ""
echo "Options:"
echo "1. Close all Dependabot PRs"
echo "2. Close specific PR numbers"
echo "3. Review PRs one by one"
echo "4. Exit"

read -p "Choose option (1-4): " option

case $option in
  1)
    echo "Closing all Dependabot PRs..."
    gh pr list --author app/dependabot --json number -q '.[].number' | while read pr; do
      echo "Closing PR #$pr"
      gh pr close $pr --comment "Closing for now - will review dependencies in bulk later"
    done
    ;;
  2)
    read -p "Enter PR numbers to close (space-separated): " pr_numbers
    for pr in $pr_numbers; do
      echo "Closing PR #$pr"
      gh pr close $pr --comment "Closing for now - will review later"
    done
    ;;
  3)
    gh pr list --author app/dependabot --json number,title | jq -r '.[] | "\(.number): \(.title)"' | while read line; do
      pr_number=$(echo $line | cut -d: -f1)
      pr_title=$(echo $line | cut -d: -f2-)
      echo ""
      echo "PR #$pr_number: $pr_title"
      read -p "Action? (m=merge, c=close, s=skip): " action
      case $action in
        m)
          gh pr merge $pr_number --auto --squash
          ;;
        c)
          gh pr close $pr_number
          ;;
        s)
          echo "Skipping..."
          ;;
      esac
    done
    ;;
  4)
    echo "Exiting..."
    exit 0
    ;;
esac

echo "Done!"