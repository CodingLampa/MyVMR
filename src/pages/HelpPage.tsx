import type React from 'react';
import styles from './HelpPage.module.css';
import libFsltl from '../assets/lib-fsltl.png';
import libAig from '../assets/lib-aig.png';
import libIvao from '../assets/lib-ivao.png';
import libFstraffic from '../assets/lib-fstraffic.png';

const STEPS = [
  {
    title: 'Auto-detect Paths',
    body: 'On the Generate VMR page, click FS2020 Paths or FS2024 Paths to automatically locate your installed model libraries. myVMR scans your UserCfg.opt for known Community package folder locations.',
  },
  {
    title: 'Set Source Folders',
    body: "If auto-detect does not find a library, paste the path to that library's Community folder manually, or use the Browse button. You only need to fill in the libraries you have installed. Please note that we currently only support the following libraries: FSLTL Traffic Base, AIG OCI, IVAO MTL, and JustFlight FSTraffic.",
  },
  {
    title: 'Configure FSLTL Options',
    body: "By default, myVMR merges the provided FSLTL VMR file into your output file. This ensures generic aircraft types that have no specific callsign are assigned an FSLTL model rather than falling back to default Asobo aircraft. Other libraries may fill generic options, and they will be left as such if they do. However, it cannot be guaranteed. We recommend installing FSLTL Traffic Base and enabling this option.",
  },
  {
    title: 'Choose a Model Preference',
    body: "If you have multiple libraries installed, the Model Provider Preference option lets you pick which library's models take priority when more than one provider has a match for the same callsign and aircraft type. Set to None to keep all matches from every library and let vPilot pick which one to use at random.",
  },
  {
    title: 'Set Output Path',
    body: 'Click Save As to choose where the generated VMR file will be written. This file can then be loaded directly into vPilot as a model-matching rule set.',
  },
  {
    title: 'Generate & Review',
    body: 'Press Generate VMR. Once complete, use the View Log button to see a summary of what was added and what was skipped. A full log file is also written next to your output file for detailed review.',
  },
];

const LIBRARIES: { name: string; key: string; logo: string; url: string; description: string; logoStyle?: React.CSSProperties }[] = [
  {
    name: 'FSLTL Traffic Base',
    key: 'fsltl',
    logo: libFsltl,
    url: 'https://fslivetrafficliveries.com/',
    description: 'FSLTL is a free standalone real-time online traffic overhaul and VATSIM model-matching solution for MSFS.',
  },
  {
    name: 'AIG OCI',
    key: 'aig',
    logo: libAig,
    url: 'https://www.alpha-india.net/software/',
    description: 'AIG AI Traffic models distributed through the AIG Manager. Provides high quality and extensive livery coverage for airlines worldwide.',
    logoStyle: { filter: 'invert(1)', maxHeight: 38 },
  },
  {
    name: 'IVAO MTL',
    key: 'ivao',
    logo: libIvao,
    url: 'https://mtl.ivao.aero/',
    description: "Multiplayer Traffic Library, MTL for short, is a free AI traffic library for users on IVAO.",
    logoStyle: { maxHeight: 128 },
  },
  {
    name: 'JustFlight FSTraffic',
    key: 'jft',
    logo: libFstraffic,
    url: 'https://www.justflight.com/product/fs-traffic-microsoft-flight-simulator',
    description: 'A frame-rate-friendly fleet of the highest quality AI aircraft models, all featuring high definition livery textures and accurate 3D details.',
    logoStyle: { maxHeight: 52 },
  },
];

const CHANGELOG: { version: string; date: string; entries: string[] }[] = [
  {
    version: '1.0.0',
    date: '13 May 2026',
    entries: [
      'Auto-detect paths for FS2020 and FS2024 via UserCfg.opt',
      'Support for FSLTL, AIG OCI, IVAO MTL, and JustFlight FSTraffic',
      'FSLTL VMR merge to ensure generic aircraft types use FSLTL models',
      'Model provider preference to prioritise one library over others',
      'Custom Rules page for adding, editing, or removing VMR entries',
      'VMR generation log with inline view and file output',
    ],
  },
];

const openUrl = (url: string) => window.electronAPI.openExternal(url);

export const HelpPage = () => (
  <div className={styles.page}>
    <div className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>Help</h1>
    </div>

    {/* About */}
    <div className={styles.card}>
      <div className="section-header" style={{paddingBottom: '0.8em'}}>
        <span>About</span>
        <hr />
      </div>
      <p className={styles.about}>
        <strong>myVMR</strong> is a tool that allows you to generate a vPilot Model Matching Rules (VMR) file from your installed MSFS AI traffic libraries.<br /><br />
        When generating the VMR file, <strong>myVMR</strong> scans each selected library, compiles all available model definitions, matches them to the callsign and aircraft type they are designed for, applies any preferences you set, and writes a ready-to-use VMR file that you can load directly into vPilot.<br /><br />
        The result is a model matching file that uses all your libraries, according to your preferences.
      </p>
    </div>

    {/* Steps */}
    <div className={styles.card}>
      <div className="section-header" style={{paddingBottom: '0.8em'}}>
        <span>How to Use</span>
        <hr />
      </div>
      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={i} className={styles.step}>
            <span className={styles.stepNum}>{i + 1}</span>
            <div className={styles.stepBody}>
              <span className={styles.stepTitle}>{s.title}</span>
              <p className={styles.stepText}>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>

    {/* Libraries */}
    <div className={styles.card}>
      <div className="section-header" style={{paddingBottom: '0.8em'}}>
        <span>Supported Libraries</span>
        <hr />
      </div>
      <div className={styles.libraries}>
        {LIBRARIES.map((lib) => (
          <div key={lib.key} className={styles.library}>
            <button
              className={styles.libLogoBtn}
              onClick={() => openUrl(lib.url)}
              title={`Open ${lib.name} website`}
            >
              <img src={lib.logo} alt={lib.name} className={styles.libLogo} style={lib.logoStyle} />
            </button>
            <p className={styles.libDesc}>{lib.description}</p>
            <button className={styles.libLink} onClick={() => openUrl(lib.url)}>
              Visit website →
            </button>
          </div>
        ))}
      </div>
    </div>

    {/* Custom Rules note */}
    <div className={styles.card}>
      <div className="section-header" style={{paddingBottom: '0.8em'}}>
        <span>Custom Rules</span>
        <hr />
      </div>
      <p className={styles.about}>
        The <strong>Custom Rules</strong> page lets you manually add, edit, or remove individual VMR entries.
        This is useful when a specific airline or callsign is not picked up by the VMR generator or you have models not inside the supported libraries.
      </p>
    </div>

    {/* Changelog */}
    <div className={styles.card}>
      <div className="section-header" style={{paddingBottom: '0.8em'}}>
        <span>Changelog</span>
        <hr />
      </div>
      <div className={styles.changelog}>
        {CHANGELOG.map((entry) => (
          <div key={entry.version} className={styles.release}>
            <div className={styles.releaseHeader}>
              <span className={styles.versionBadge}>v{entry.version}</span>
              <span className={styles.releaseDate}>{entry.date}</span>
            </div>
            <ul className={styles.releaseList}>
              {entry.entries.map((item, i) => (
                <li key={i} className={styles.releaseItem}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </div>
);
