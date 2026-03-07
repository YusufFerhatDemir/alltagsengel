import React from 'react';

interface AppMockupProps {
  size?: number;
}

const AppMockup: React.FC<AppMockupProps> = ({ size = 300 }) => {
  const scale = size / 300;
  const width = 300 * scale;
  const height = 600 * scale;
  const cornerRadius = 24 * scale;
  const notchWidth = 120 * scale;
  const notchHeight = 28 * scale;

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 300 600"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-lg"
    >
      {/* Phone Frame Outer Shadow */}
      <defs>
        <filter id="frameShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.3" />
        </filter>
        <linearGradient id="screenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2a241f" />
          <stop offset="100%" stopColor="#1a1612" />
        </linearGradient>
      </defs>

      {/* Phone Body */}
      <rect
        x="8"
        y="8"
        width="284"
        height="584"
        rx={cornerRadius}
        fill="#1a1612"
        filter="url(#frameShadow)"
      />

      {/* Phone Frame Border */}
      <rect
        x="10"
        y="10"
        width="280"
        height="580"
        rx={cornerRadius - 2}
        fill="none"
        stroke="#2a2420"
        strokeWidth="2"
      />

      {/* Notch */}
      <rect
        x={`${(300 - notchWidth) / 2}`}
        y="12"
        width={notchWidth}
        height={notchHeight}
        rx="6"
        fill="#0a0a0a"
      />

      {/* Screen Background */}
      <rect
        x="14"
        y="48"
        width="272"
        height="540"
        rx={cornerRadius - 8}
        fill="url(#screenGradient)"
      />

      {/* Header - Greeting */}
      <text
        x="24"
        y="85"
        fontSize="20"
        fontWeight="600"
        fill="#DBA84A"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Hallo, Yusuf
      </text>

      {/* Search Bar Background */}
      <rect
        x="24"
        y="100"
        width="252"
        height="40"
        rx="8"
        fill="#252118"
        stroke="#3a3228"
        strokeWidth="1"
      />

      {/* Search Bar Icon */}
      <circle cx="36" cy="120" r="3" fill="#8b7f6e" />
      <path
        d="M42 120 L48 120"
        stroke="#8b7f6e"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Search Bar Text */}
      <text
        x="42"
        y="124"
        fontSize="12"
        fill="#6b5f4e"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Suchen...
      </text>

      {/* Categories Section Label */}
      <text
        x="24"
        y="160"
        fontSize="13"
        fontWeight="500"
        fill="#c9c1b6"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Kategorien
      </text>

      {/* Category Icons Row */}
      {/* Begleitung */}
      <circle cx="50" cy="190" r="18" fill="#C9963C" opacity="0.8" />
      <text
        x="50"
        y="195"
        fontSize="10"
        fontWeight="600"
        fill="#fff"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        👥
      </text>
      <text
        x="50"
        y="215"
        fontSize="10"
        fill="#c9c1b6"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Begleitung
      </text>

      {/* Arzt */}
      <circle cx="116" cy="190" r="18" fill="#C9963C" opacity="0.8" />
      <text
        x="116"
        y="195"
        fontSize="10"
        fontWeight="600"
        fill="#fff"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        ⚕️
      </text>
      <text
        x="116"
        y="215"
        fontSize="10"
        fill="#c9c1b6"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Arzt
      </text>

      {/* Einkauf */}
      <circle cx="182" cy="190" r="18" fill="#C9963C" opacity="0.8" />
      <text
        x="182"
        y="195"
        fontSize="10"
        fontWeight="600"
        fill="#fff"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        🛒
      </text>
      <text
        x="182"
        y="215"
        fontSize="10"
        fill="#c9c1b6"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Einkauf
      </text>

      {/* Haushalt */}
      <circle cx="248" cy="190" r="18" fill="#C9963C" opacity="0.8" />
      <text
        x="248"
        y="195"
        fontSize="10"
        fontWeight="600"
        fill="#fff"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        🏠
      </text>
      <text
        x="248"
        y="215"
        fontSize="10"
        fill="#c9c1b6"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Haushalt
      </text>

      {/* Engel Card Section Label */}
      <text
        x="24"
        y="245"
        fontSize="13"
        fontWeight="500"
        fill="#c9c1b6"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Verfügbare Engel
      </text>

      {/* Card Background */}
      <rect
        x="24"
        y="260"
        width="252"
        height="140"
        rx="12"
        fill="#252118"
        stroke="#3a3228"
        strokeWidth="1"
      />

      {/* Avatar Circle */}
      <circle cx="56" cy="295" r="20" fill="#C9963C" opacity="0.7" />
      <text
        x="56"
        y="302"
        fontSize="18"
        fontWeight="600"
        fill="#fff"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        M
      </text>

      {/* Card Name and Role */}
      <text
        x="88"
        y="285"
        fontSize="14"
        fontWeight="600"
        fill="#DBA84A"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Maria Schmidt
      </text>

      <text
        x="88"
        y="303"
        fontSize="11"
        fill="#9a8e7d"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Begleitung • 4,8 km entfernt
      </text>

      {/* Description */}
      <text
        x="24"
        y="330"
        fontSize="10"
        fill="#b5a89b"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Erfahrene Begleiterin mit Fokus auf
      </text>

      <text
        x="24"
        y="343"
        fontSize="10"
        fill="#b5a89b"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        Freizeitaktivitäten und Gesprächs-
      </text>

      {/* Stars Row */}
      <text
        x="88"
        y="368"
        fontSize="12"
        fill="#DBA84A"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        ★ ★ ★ ★ ★
      </text>

      <text
        x="202"
        y="368"
        fontSize="10"
        fill="#9a8e7d"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        (42 Bewertungen)
      </text>

      {/* Action Button */}
      <rect
        x="24"
        y="385"
        width="252"
        height="10"
        rx="4"
        fill="#C9963C"
        opacity="0.7"
      />

      {/* Bottom Navigation Indicator */}
      <line
        x1="80"
        y1="550"
        x2="220"
        y2="550"
        stroke="#3a3228"
        strokeWidth="1"
        opacity="0.5"
      />

      {/* Home Icon */}
      <circle cx="150" cy="565" r="6" fill="#DBA84A" />

      {/* Other Nav Icons (inactive) */}
      <circle cx="90" cy="565" r="4" fill="#6b5f4e" opacity="0.6" />
      <circle cx="210" cy="565" r="4" fill="#6b5f4e" opacity="0.6" />
      <circle cx="270" cy="565" r="4" fill="#6b5f4e" opacity="0.6" />
    </svg>
  );
};

export default AppMockup;
