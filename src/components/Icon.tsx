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
  | 'scale';

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
    </Svg>
  );
}
