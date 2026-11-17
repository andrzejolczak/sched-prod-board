# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board: its row opens the incident panel, which names the incident; Ack is in the panel — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** Clicking an incident row opens its **incident panel** beside the list. The panel names the incident id and holds the **Ack** button. Ack sends the ack (`api.ack(id)`) for the incident the panel names and marks its row acked. Rows have no Ack button. The panel does not move or change incident when the list refreshes; clicking another row switches it. *(Changed by product's decision, see Decisions.)*
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open. A refresh adds new rows and updates rows in place; it does not rebuild rows that are already on the board.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| `incident-panel` | the incident panel, naming the incident id (also `data-id="<incident id>"`) |
| `panel-ack` | the Ack button in the panel |
| `acked` | the acked mark in a row |
| `build-sha` | the sha in the footer |

## Decisions

- **2026-11-17 — Ack leaves the row (product).** Evidence: with R1 + R4, a new incident moves every row down while on-call aims at a row's Ack button, so the click acks a different incident (recording of build `d7a0139`, 00:15: aimed at INC-2729, acked INC-3702). Product decided: "New incidents stay live at the top. Ack leaves the row: a row opens its incident panel, and Ack lives there." R1 is unchanged. R2 changed. Hook `ack` removed; hooks `incident-panel` and `panel-ack` added.

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
