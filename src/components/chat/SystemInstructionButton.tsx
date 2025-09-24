import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
import SystemInstructionModal from './SystemInstructionModal';

const SystemInstructionButton = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)}>
                <Settings className="h-4 w-4" />
            </Button>
            <SystemInstructionModal open={open} onOpenChange={setOpen} />
        </>
    );
};

export default SystemInstructionButton;
