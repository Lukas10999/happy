import * as React from 'react';
import { Image, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { Text } from '../StyledText';
import { Typography } from '@/constants/Typography';
import { useMarkdownImage } from '@/hooks/useMarkdownImage';
import { t } from '@/text';

export const MarkdownImage = React.memo((props: { url: string; alt: string; sessionId?: string }) => {
    const { uri, failed, retry, onError } = useMarkdownImage(props.url, props.sessionId);
    return (
        <View style={styles.container}>
            {failed ? (
                <View style={[styles.image, styles.placeholder]}>
                    <Text style={styles.caption}>{t('files.failedToRead')}</Text>
                    <Pressable onPress={retry} accessibilityRole="button">
                        <Text style={styles.caption}>{t('common.retry')}</Text>
                    </Pressable>
                </View>
            ) : uri ? (
                <Image
                    key={uri}
                    source={{ uri }}
                    style={styles.image}
                    accessibilityLabel={props.alt || undefined}
                    resizeMode="contain"
                    onError={onError}
                />
            ) : (
                <View style={[styles.image, styles.placeholder]}>
                    <Text style={styles.caption}>{t('common.loading')}</Text>
                </View>
            )}
            {props.alt ? <Text style={styles.caption}>{props.alt}</Text> : null}
        </View>
    );
});

const styles = StyleSheet.create(theme => ({
    container: { width: '100%', gap: 8 },
    image: {
        width: '100%', minHeight: 160, height: 240, borderRadius: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
    caption: {
        ...Typography.default(), fontSize: 14, lineHeight: 20,
        color: theme.colors.textSecondary,
    },
}));
