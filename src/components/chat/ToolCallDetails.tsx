import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { ToolCallState } from '@/hooks/chatProviderContext';

interface ToolCallDetailsProps {
    call: ToolCallState;
}

const ToolCallDetails: React.FC<ToolCallDetailsProps> = ({ call }) => {
    return (
        <Card className="border-muted-foreground/20 bg-muted/30">
            <CardHeader className="flex flex-row items-center justify-between py-3">
                <div className="flex flex-col gap-1">
                    <CardTitle className="text-sm font-semibold">{call.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">Tool Invocation</p>
                </div>
                <Badge variant={call.status === 'error' ? 'destructive' : call.status === 'success' ? 'default' : 'secondary'} className="uppercase tracking-wide text-[10px]">
                    {call.status === 'running' ? 'In Progress' : call.status}
                </Badge>
            </CardHeader>
            <Separator className="bg-muted-foreground/20" />
            <CardContent className="space-y-3 py-4">
                <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Request</p>
                    <pre className="rounded-md bg-background/60 p-3 text-xs text-muted-foreground overflow-x-auto">
                        {call.arguments}
                    </pre>
                </div>
                {call.response && (
                    <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Response</p>
                        <pre className="rounded-md bg-background/60 p-3 text-xs text-muted-foreground overflow-x-auto">
                            {call.response}
                        </pre>
                    </div>
                )}
                {call.error && (
                    <div>
                        <p className="mb-1 text-xs font-medium text-destructive uppercase tracking-wide">Error</p>
                        <pre className="rounded-md bg-destructive/10 p-3 text-xs text-destructive overflow-x-auto">
                            {call.error}
                        </pre>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default ToolCallDetails;
