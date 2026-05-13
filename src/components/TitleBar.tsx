import { Minus, Square, X } from 'react-feather';
import styles from './TitleBar.module.css';
import logo from '../assets/logo.png';

export const TitleBar = () => (
  <div className={styles.titlebar}>
    <img src={logo} alt="myVMR" className={styles.titleLogo} />
    <div className={styles.controls}>
      <button onClick={() => window.electronAPI.windowMinimize()} className={styles.btn} title="Minimise">
        <Minus size={13} />
      </button>
      <button onClick={() => window.electronAPI.windowMaximize()} className={styles.btn} title="Maximise">
        <Square size={12} />
      </button>
      <button onClick={() => window.electronAPI.windowClose()} className={`${styles.btn} ${styles.close}`} title="Close">
        <X size={14} />
      </button>
    </div>
  </div>
);
