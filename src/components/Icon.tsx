import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'today'
  | 'nutrition'
  | 'movement'
  | 'sleep'
  | 'plus'
  | 'drop'
  | 'heart'
  | 'chevron'
  | 'camera'
  | 'close'
  | 'moon'
  | 'sparkle'
  | 'bulb'
  | 'chat'
  | 'scale'
  | 'back'
  | 'chevronLeft'
  | 'minus'
  | 'check'
  | 'flash'
  | 'image'
  | 'barcode'
  | 'text'
  | 'mic'
  | 'trash'
  | 'watch'
  | 'lock'
  | 'download'
  | 'logout'
  | 'edit'
  | 'arrowRight'
  | 'trend'
  | 'phone'
  | 'mail'
  | 'star'
  | 'target'
  | 'clock'
  | 'dots'
  | 'info';

interface Props {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/** Line icons drawn to match the prototype (no emoji in UI). */
export function Icon({ name, size = 24, color, strokeWidth = 1.8 }: Props) {
  const p = {
    stroke: color,
    strokeWidth,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'today' && (
        <>
          <Circle cx={12} cy={12} r={4} {...p} />
          <Path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" {...p} />
        </>
      )}
      {name === 'nutrition' && (
        <>
          <Path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z" {...p} />
          <Path d="M9 8c0-1.5 1.2-1.8 1.2-3.3M13.5 8c0-1.5 1.2-1.8 1.2-3.3" {...p} />
        </>
      )}
      {name === 'movement' && <Path d="M3 12.5h4l2.5-6 5 12 2.5-6H21" {...p} />}
      {(name === 'sleep' || name === 'moon') && (
        <Path d="M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7Z" {...p} />
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === 'drop' && <Path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" {...p} />}
      {name === 'heart' && (
        <Path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" {...p} />
      )}
      {name === 'chevron' && <Path d="M9 5.5 15.5 12 9 18.5" {...p} />}
      {name === 'camera' && (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3v11H4Z" {...p} />
          <Circle cx={12} cy={13} r={3.5} {...p} />
        </>
      )}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...p} />}
      {name === 'sparkle' && (
        <Path d="M12 3.5 13.8 10l6.7 2-6.7 2L12 20.5 10.2 14l-6.7-2 6.7-2Z" {...p} />
      )}
      {name === 'bulb' && (
        <Path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" {...p} />
      )}
      {name === 'chat' && <Path d="M5 5h14v10H10l-5 4Z" {...p} />}
      {name === 'scale' && (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={4} {...p} />
          <Path d="M9 10a3 3 0 0 1 6 0M12 10l1.2-1.6" {...p} />
        </>
      )}
      {name === 'back' && <Path d="M19 12H5M11 6l-6 6 6 6" {...p} />}
      {name === 'chevronLeft' && <Path d="M15 5.5 8.5 12 15 18.5" {...p} />}
      {name === 'minus' && <Path d="M5 12h14" {...p} />}
      {name === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" {...p} />}
      {name === 'flash' && <Path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z" {...p} />}
      {name === 'image' && (
        <>
          <Rect x={3.5} y={4.5} width={17} height={15} rx={3} {...p} />
          <Circle cx={9} cy={10} r={1.8} {...p} />
          <Path d="m20.5 16-5-5-8 8.5" {...p} />
        </>
      )}
      {name === 'barcode' && <Path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12" {...p} />}
      {name === 'text' && (
        <>
          <Rect x={3} y={6} width={18} height={12} rx={2.5} {...p} />
          <Path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" {...p} />
        </>
      )}
      {name === 'mic' && (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} {...p} />
          <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" {...p} />
        </>
      )}
      {name === 'trash' && <Path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" {...p} />}
      {name === 'watch' && (
        <>
          <Rect x={6} y={6} width={12} height={12} rx={3.5} {...p} />
          <Path d="M9 6l.8-3h4.4l.8 3M9 18l.8 3h4.4l.8-3M12 9.5V12l1.5 1.5" {...p} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2.5} {...p} />
          <Path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" {...p} />
        </>
      )}
      {name === 'download' && <Path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" {...p} />}
      {name === 'logout' && <Path d="M14 4.5H6.5v15H14M10 12h10M16.5 8.5 20 12l-3.5 3.5" {...p} />}
      {name === 'edit' && <Path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3L8.5 18l-4 1.5Z" {...p} />}
      {name === 'arrowRight' && <Path d="M5 12h14M13 6l6 6-6 6" {...p} />}
      {name === 'trend' && <Path d="M4 17l5.5-5.5 3.5 3.5L20 8M14.5 8H20v5.5" {...p} />}
      {name === 'phone' && (
        <>
          <Rect x={7} y={3} width={10} height={18} rx={2.5} {...p} />
          <Path d="M11 18h2" {...p} />
        </>
      )}
      {name === 'mail' && (
        <>
          <Rect x={3.5} y={5.5} width={17} height={13} rx={2.5} {...p} />
          <Path d="m4 7 8 6 8-6" {...p} />
        </>
      )}
      {name === 'star' && <Path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6Z" {...p} />}
      {name === 'target' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Circle cx={12} cy={12} r={4.5} {...p} />
          <Circle cx={12} cy={12} r={0.8} {...p} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M12 7.5V12l3 2" {...p} />
        </>
      )}
      {name === 'info' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M12 11v5M12 8h.01" {...p} />
        </>
      )}
      {name === 'dots' && <Path d="M6 12h.01M12 12h.01M18 12h.01" {...p} strokeWidth={3} />}
    </Svg>
  );
}
