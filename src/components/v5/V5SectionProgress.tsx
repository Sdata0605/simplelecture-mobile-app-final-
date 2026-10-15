import { View, StyleSheet } from 'react-native';
import type { V5TimelineSection } from '../../services/v5PlayerService';

/**
 * Segmented section bar — port of web's `.v5-section-progress`.
 *
 * One segment per section, width proportional to that section's duration, with
 * the active section lit. Gives the learner a sense of "where am I in this
 * lecture" that a plain seek bar can't. Hidden in fullscreen, same as web.
 */

interface V5SectionProgressProps {
  timeline: V5TimelineSection[];
  activeIndex: number | null;
}

export default function V5SectionProgress({ timeline, activeIndex }: V5SectionProgressProps) {
  if (timeline.length === 0) return null;

  return (
    <View style={styles.bar} pointerEvents="none">
      {timeline.map((entry) => (
        <View
          key={String(entry.section.section_id)}
          style={[
            styles.segment,
            { flexGrow: entry.duration },
            entry.sectionIndex === activeIndex && styles.segmentActive,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 2,
    zIndex: 4,
  },
  segment: {
    flexBasis: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  segmentActive: {
    backgroundColor: '#7ce0c3',
  },
});
