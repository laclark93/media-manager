import { NavLink } from 'react-router-dom';
import './Header.css';

export function Header() {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">Missing Media</div>
      <nav className="sidebar__nav">
        <NavLink
          to="/shows"
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <span className="sidebar__icon">📺</span>
          <span className="sidebar__label">Shows</span>
        </NavLink>
        <NavLink
          to="/movies"
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <span className="sidebar__icon">🎬</span>
          <span className="sidebar__label">Movies</span>
        </NavLink>
        <NavLink
          to="/issues"
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <span className="sidebar__icon">⚠️</span>
          <span className="sidebar__label">Issues</span>
        </NavLink>
        <NavLink
          to="/anime"
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <span className="sidebar__icon">⛩</span>
          <span className="sidebar__label">Anime</span>
        </NavLink>
        <div className="sidebar__spacer" />
        <div className="sidebar__divider" />
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <span className="sidebar__icon">⚙</span>
          <span className="sidebar__label">Settings</span>
        </NavLink>
        <NavLink
          to="/log"
          className={({ isActive }) => `sidebar__link${isActive ? ' sidebar__link--active' : ''}`}
        >
          <span className="sidebar__icon">📋</span>
          <span className="sidebar__label">Log</span>
        </NavLink>
      </nav>
    </aside>
  );
}
