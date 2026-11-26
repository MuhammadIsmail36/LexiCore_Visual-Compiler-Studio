/** Left activity rail selecting the side-bar view. */

import { useIde, type Activity } from '../state/IdeContext';

const ITEMS: { id: Activity; icon: string; label: string }[] = [
  { id: 'explorer', icon: '▤', label: 'Explorer' },
  { id: 'search', icon: '⌕', label: 'Search' },
  { id: 'compiler', icon: '⚙', label: 'Compiler Pipeline' },
  { id: 'debug', icon: '◉', label: 'Run and Debug' },
  { id: 'settings', icon: '☰', label: 'Preferences' },
];

export function ActivityBar() {
  const { state, dispatch } = useIde();

  return (
    <div className="activity-bar" role="tablist" aria-label="Activity bar">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={state.activity === item.id}
          title={item.label}
          className={`activity-item ${state.activity === item.id ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'setActivity', activity: item.id })}
        >
          <span className="activity-icon">{item.icon}</span>
        </button>
      ))}
      <div className="activity-spacer" />
      <button
        className="activity-item"
        title="Toggle command palette"
        onClick={() => dispatch({ type: 'setPalette', open: true })}
      >
        <span className="activity-icon">⌘</span>
      </button>
    </div>
  );
}
