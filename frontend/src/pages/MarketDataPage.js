import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import IndicationsTab from './market/IndicationsTab';
import PricesTab from './market/PricesTab';
import TurkishExchangesTab from './market/TurkishExchangesTab';
import TMOTendersTab from './market/TMOTendersTab';
import CoasterFreightsTab from './market/CoasterFreightsTab';
import TelegramSidebar from './market/TelegramSidebar';

export default function MarketDataPage() {
  const [activeTab, setActiveTab] = useState('news');

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]" data-testid="market-data-page">
      {/* Main Content */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-2">
        <div></div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full max-w-3xl flex">
            <TabsTrigger value="news" data-testid="tab-indications" className="flex-1">Indications</TabsTrigger>
            <TabsTrigger value="prices" data-testid="tab-prices" className="flex-1">CBOT & Exchange Rates</TabsTrigger>
            <TabsTrigger value="turkish" data-testid="tab-turkish" className="flex-1">Turkish Exchanges</TabsTrigger>
            <TabsTrigger value="tenders" data-testid="tab-tenders" className="flex-1">Tenders</TabsTrigger>
            <TabsTrigger value="freights" data-testid="tab-freights" className="flex-1">Coaster Freights</TabsTrigger>
          </TabsList>

          <TabsContent value="news">
            <IndicationsTab />
          </TabsContent>

          <TabsContent value="prices">
            <PricesTab />
          </TabsContent>

          <TabsContent value="turkish">
            <TurkishExchangesTab />
          </TabsContent>

          <TabsContent value="tenders">
            <TMOTendersTab />
          </TabsContent>

          <TabsContent value="freights">
            <CoasterFreightsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Telegram Sidebar */}
      <div className="w-80 border-l pl-4 hidden lg:block">
        <TelegramSidebar />
      </div>
    </div>
  );
}
