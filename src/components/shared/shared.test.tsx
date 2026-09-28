import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConfirmHost, confirm } from './confirm'
import { FieldRow } from './field-row'
import { Panel, PanelAddRow } from './panel'

describe('confirm', () => {
  it('resolves true when confirmed and false when cancelled', async () => {
    const user = userEvent.setup()
    render(<ConfirmHost />)

    let pending!: Promise<boolean>
    act(() => {
      pending = confirm({ title: 'Delete Pet?', confirmLabel: 'Delete schema', destructive: true })
    })
    await user.click(await screen.findByRole('button', { name: 'Delete schema' }))
    await expect(pending).resolves.toBe(true)

    act(() => {
      pending = confirm({ title: 'Start over?', confirmLabel: 'Start a new document' })
    })
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await expect(pending).resolves.toBe(false)
  })
})

describe('Panel', () => {
  it('labels the section by its title and renders an add row footer', async () => {
    const user = userEvent.setup()
    let added = 0
    render(
      <Panel id="fields" title="Fields" count={2} footer={<PanelAddRow label="Add field" onClick={() => added++} />}>
        body
      </Panel>,
    )
    expect(screen.getByRole('region', { name: 'Fields' })).toHaveAttribute('id', 'fields')
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    expect(added).toBe(1)
  })
})

describe('FieldRow', () => {
  it('associates the label and shows issues under the control', () => {
    render(
      <FieldRow label="Summary" htmlFor="summary" issues={[{ message: 'Summary is empty', severity: 'warning' }]}>
        <input id="summary" aria-describedby="summary-issues" />
      </FieldRow>,
    )
    const input = screen.getByLabelText('Summary')
    expect(input).toHaveAccessibleDescription('Warning: Summary is empty')
  })
})
