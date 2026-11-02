import { View, StyleSheet } from 'react-native';
import { spacing } from '../../../constants/theme';
import TimeField from '../../time/TimeField';
import { keepRangeValid } from './timePresets';

// Custom From / To times. Two TimeFields, each opening the any-minute picker (00 to 59).
// Times are kept exactly as picked: no rounding to 15 minutes.

interface TimeRangeFieldProps {
  /** 'HH:MM' 24-hour. */
  start: string;
  /** 'HH:MM' 24-hour. */
  end: string;
  onChange(start: string, end: string): void;
  disabled?: boolean;
}

export default function TimeRangeField({ start, end, onChange, disabled }: TimeRangeFieldProps) {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <TimeField
          label="From"
          sheetTitle="From time"
          value={start}
          disabled={disabled}
          onChange={picked => {
            const next = keepRangeValid(picked, end);
            onChange(next.start, next.end);
          }}
        />
      </View>
      <View style={styles.cell}>
        <TimeField
          label="To"
          sheetTitle="To time"
          value={end}
          disabled={disabled}
          onChange={picked => onChange(start, picked)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
});
