// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { computeTrends } from '@shared/simulation'
import { Segmented } from './Segmented'
import { TrendChart } from './TrendChart'

describe('Segmented', () => {
  it('marks exactly one option as pressed and reports changes', () => {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Map layer"
        value="activity"
        onChange={onChange}
        options={[
          { value: 'activity', label: 'Activity' },
          { value: 'heat', label: 'Heat map' },
        ]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Map layer' })
    expect(within(group).getByRole('button', { name: 'Activity' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(group).getByRole('button', { name: 'Heat map' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(within(group).getByRole('button', { name: 'Heat map' }))
    expect(onChange).toHaveBeenCalledWith('heat')
  })
})

describe('TrendChart', () => {
  it('renders an accessible chart with a data table fallback', () => {
    const data = computeTrends(Date.parse('2026-09-17T12:00:00Z'), 24)
    render(<TrendChart data={data} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/last 24 hours/)
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getAllByRole('row')).toHaveLength(25)
  })

  it('renders nothing for fewer than two points', () => {
    const { container } = render(<TrendChart data={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
