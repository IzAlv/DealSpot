import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Send } from 'lucide-react';

export default function TelegramSidebar() {
  const [telegramMessages, setTelegramMessages] = useState([]);
  const [telegramChannels, setTelegramChannels] = useState([]);
  const [selectedTgMessage, setSelectedTgMessage] = useState(null);

  useEffect(() => {
    fetchTelegramData();
  }, []);

  const fetchTelegramData = async () => {
    try {
      const [messagesRes, channelsRes] = await Promise.all([
        api.get('/api/market/telegram/messages').catch(() => ({ data: { messages: [] } })),
        api.get('/api/market/telegram/channels').catch(() => ({ data: [] })),
      ]);
      setTelegramMessages(messagesRes.data.messages || []);
      setTelegramChannels(channelsRes.data);
    } catch (err) {
      console.error('Failed to load telegram data');
    }
  };

  return (
    <>
      <Card className="h-full" data-testid="telegram-sidebar">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-500" />
            Telegram Feed
          </CardTitle>
          <CardDescription>{telegramChannels.length} channel(s) configured</CardDescription>
        </CardHeader>
        <CardContent className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 250px)' }}>
          {telegramMessages.length === 0 ? (
            <div className="text-center py-8">
              <Send className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {telegramMessages.map((msg, i) => (
                <div 
                  key={i} 
                  className="p-2.5 bg-muted/50 rounded-lg text-sm hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => setSelectedTgMessage(msg)}
                  data-testid={`telegram-msg-${i}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="font-semibold text-xs text-blue-600">{msg.channelName}</span>
                  </div>
                  <p className="text-foreground leading-snug text-xs">
                    {msg.text?.slice(0, 200)}{msg.text?.length > 200 ? '...' : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {msg.date ? new Date(msg.date).toLocaleDateString('en-GB') + ' ' + new Date(msg.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telegram Message Popup */}
      <Dialog open={!!selectedTgMessage} onOpenChange={() => setSelectedTgMessage(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-blue-600 flex items-center gap-2">
              <Send className="h-4 w-4" />
              {selectedTgMessage?.channelName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedTgMessage?.text}</p>
            <p className="text-xs text-muted-foreground">
              {selectedTgMessage?.date ? new Date(selectedTgMessage.date).toLocaleDateString('en-GB') + ' ' + new Date(selectedTgMessage.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedTgMessage(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
