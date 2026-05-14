import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FileText, List, HelpCircle, ChevronsLeft, ChevronsRight } from 'react-feather';
import styles from './Sidebar.module.css';
import logo from '../assets/logo.png';

const NAV = [
  { to: '/generate',     icon: FileText,   label: 'Generate VMR' },
  { to: '/custom-rules', icon: List,       label: 'Custom Rules' },
  { to: '/help',         icon: HelpCircle, label: 'Help'         },
];

export const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRenderExpanded, setIsRenderExpanded] = useState(true);

  const toggle = () => {
    if (isCollapsed) {
      setIsCollapsed(false);
      setTimeout(() => setIsRenderExpanded(true), 280);
    } else {
      setIsRenderExpanded(false);
      setIsCollapsed(true);
    }
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
      <ul className={styles.nav}>
        <li>
          <button className={styles.collapseBtn} onClick={toggle} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            {isRenderExpanded && <span>Collapse</span>}
          </button>
        </li>
        {NAV.map(({ to, icon: Icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
            >
              <Icon size={16} />
              {isRenderExpanded && <span>{label}</span>}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className={`${styles.brand} ${isCollapsed ? styles.brandCollapsed : ''}`}>
        <img src={logo} alt="myVMR" className={styles.brandLogo} />
      </div>
    </aside>
  );
};
