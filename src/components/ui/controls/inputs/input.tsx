import { IconSymbol } from '@/components/ui/display/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import * as React from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

interface InputProps extends TextInputProps {
  /** Optional error state to change border color */
  error?: boolean;
}

/**
 * Accessible input component with proper text scrolling.
 * Allows horizontal scrolling for long text and proper cursor positioning.
 * Shows a clear button when text is present.
 */
const Input = React.forwardRef<TextInput, InputProps>(
  ({ style, error, editable = true, value, onChangeText, ...props }, ref) => {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const hasValue = !!value && value.length > 0;

    return (
      <View style={styles.wrapper}>
        <TextInput
          ref={ref}
          editable={editable}
          value={value}
          onChangeText={onChangeText}
          placeholderTextColor={isDark ? '#888' : '#999'}
          style={[
            styles.input,
            {
              backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
              color: isDark ? '#ffffff' : '#000000',
              borderColor: error
                ? '#ef4444'
                : isDark
                ? '#444'
                : '#ddd',
            },
            hasValue && styles.inputWithClear,
            !editable && styles.disabled,
            style,
          ]}
          {...props}
        />
        {hasValue && editable && (
          <Pressable
            onPress={() => onChangeText?.('')}
            style={styles.clearButton}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Clear input"
          >
            <IconSymbol
              name="xmark.circle.fill"
              size={24}
              color={isDark ? '#666' : '#999'}
            />
          </Pressable>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  inputWithClear: {
    paddingRight: 36,
  },
  clearButton: {
    position: 'absolute',
    right: 10,
  },
  disabled: {
    opacity: 0.5,
  },
});

export { Input };
