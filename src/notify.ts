export type AlertLevel = 'ERROR' | 'WARN' | 'OK';

const levelColors: Record<AlertLevel, number> = {
    ERROR: 0xed4245,
    WARN: 0xfee75c,
    OK: 0x57f287,
};

function truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) {
        return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
}

let missingWebhookWarned = false;

export async function sendAlert(
    level: AlertLevel,
    title: string,
    description: string,
) {
    try {
        await sendMessage(level, title, description);
    } catch (error) {
        console.warn('Failed to send Discord webhook message:', error);
    }
}

async function sendMessage(
    level: AlertLevel,
    title: string,
    description: string,
) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!webhookUrl) {
        if (!missingWebhookWarned) {
            console.warn(
                'DISCORD_WEBHOOK_URL is not set; skipping Discord webhook messages.',
            );
            missingWebhookWarned = true;
        }
        return;
    }

    // Only ping the role on ERROR; degradation warnings stay quiet.
    const roleId = process.env.DISCORD_MENTION_ROLE_ID?.trim() || undefined;
    const mentionRoleId = roleId && level === 'ERROR' ? roleId : undefined;
    const content = mentionRoleId ? `<@&${mentionRoleId}>` : undefined;

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content,
            allowed_mentions: mentionRoleId
                ? {
                      roles: [mentionRoleId],
                  }
                : undefined,
            embeds: [
                {
                    title: `${level}: ${title}`,
                    description: truncate(description, 2048),
                    color: levelColors[level],
                    timestamp: new Date().toISOString(),
                },
            ],
        }),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
            `Discord webhook failed with HTTP ${response.status}: ${responseText}`,
        );
    }
}
