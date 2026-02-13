import * as React from 'react';
import { TextInput, type TextInputProps, StyleSheet } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlassColors } from '@/lib/theme';

interface TextareaProps extends Omit<TextInputProps, 'multiline'> {
  /** Optional error state to change border color */
  error?: boolean;
}

/**
 * Multiline text input with scrolling support for long text.
 * Ideal for URLs and long-form content.
 */
const Textarea = React.forwardRef<TextInput, TextareaProps>(
  ({ style, error, editable = true, ...props }, ref) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
      <TextInput
        ref={ref}
        editable={editable}
        multiline
        textAlignVertical="top"
        scrollEnabled
        placeholderTextColor={isDark ? '#6b7394' : '#8a90a0'}
        style={[
          styles.textarea,
          {
            backgroundColor: isDark ? GlassColors.dark.surface : GlassColors.light.surface,
            color: isDark ? '#ffffff' : '#000000',
            borderColor: error
              ? '#ef4444'
              : isDark
              ? GlassColors.dark.border
              : GlassColors.light.border,
          },
          !editable && styles.disabled,
          style,
        ]}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

const styles = StyleSheet.create({
  textarea: {
    minHeight: 88,
    maxHeight: 132,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
});

export { Textarea };
