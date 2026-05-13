import { Outlet } from 'react-router-dom';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import styles from './Layout.module.css';

export const Layout = () => (
  <div className={styles.root}>
    <TitleBar />
    <div className={styles.body}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  </div>
);
