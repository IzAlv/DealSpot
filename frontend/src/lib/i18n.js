import { createContext, useContext, useState, useCallback } from 'react';

const translations = {
  en: {
    // Sidebar
    'nav.dashboard': 'Dashboard',
    'nav.trades': 'Trades',
    'nav.brokerageInv': 'Brokerage Inv.',
    'nav.shipmentDocs': 'Shipment Docs.',
    'nav.calendar': 'Calendar',
    'nav.accounting': 'Accounting',
    'nav.reports': 'Reports',
    'nav.vessels': 'Vessels',
    'nav.counterparties': 'Counterparties',
    'nav.settings': 'Settings',
    'nav.darkMode': 'Dark Mode',
    'nav.lightMode': 'Light Mode',
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.ongoingTrades': 'Ongoing Trades',
    'dashboard.pendingTrades': 'Pending Trades',
    'dashboard.completedTrades': 'Completed Trades',
    'dashboard.inTransit': 'In transit',
    'dashboard.awaitingConfirmation': 'Awaiting confirmation',
    'dashboard.increasedFromLastMonth': 'Increased from last month',
    'dashboard.upcomingPayments': 'Upcoming Payments & Events',
    'dashboard.dueInvoices': 'Due invoices, meetings, and conferences',
    'dashboard.viewCalendar': 'View Calendar',
    'dashboard.noUpcoming': 'No upcoming items',
    'dashboard.tradeProgress': 'Trade Progress',
    'dashboard.overallCompletion': 'Overall completion rate',
    'dashboard.viewAll': 'View All',
    'dashboard.completed': 'Completed',
    'dashboard.inProgress': 'In Progress',
    'dashboard.pending': 'Pending',
    'dashboard.noTrades': 'No trades yet',
    // Trades
    'trades.title': 'Trades',
    'trades.subtitle': 'Manage all your commodity trades',
    'trades.searchPlaceholder': 'Search trades...',
    'trades.filters': 'Filters',
    'trades.newTrade': 'New Trade',
    'trades.ongoingTrades': 'Ongoing Trades',
    'trades.ongoingDesc': 'Trades with vessel details',
    'trades.pendingTrades': 'Pending Trades',
    'trades.pendingDesc': 'Waiting for vessel nomination',
    'trades.completedTrades': 'Completed Trades',
    'trades.completedDesc': 'Successfully closed contracts',
    'trades.clearFilter': 'Clear Filter',
    // Calendar
    'calendar.title': 'Calendar',
    'calendar.subtitle': 'Track events, deadlines, and meetings',
    'calendar.addEvent': 'Add Event',
    'calendar.newEvent': 'New Event',
    'calendar.editEvent': 'Edit Event',
    'calendar.selectDate': 'Select a date',
    'calendar.clickDay': 'Click on a day to see events',
    'calendar.noEvents': 'No events on this day',
    'calendar.allEvents': 'All Events',
    'calendar.noScheduled': 'No events scheduled',
    'calendar.holidays': 'Holidays',
    'calendar.title_field': 'Title',
    'calendar.date_field': 'Date',
    'calendar.type_field': 'Type',
    'calendar.description_field': 'Description',
    'calendar.cancel': 'Cancel',
    'calendar.create': 'Create',
    'calendar.save': 'Save',
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.loading': 'Loading...',
  },
  tr: {
    // Sidebar
    'nav.dashboard': 'Ana Sayfa',
    'nav.trades': 'Anlasmalar',
    'nav.brokerageInv': 'Komisyon Faturalari',
    'nav.shipmentDocs': 'Sevkiyat Dok.',
    'nav.calendar': 'Takvim',
    'nav.accounting': 'Muhasebe',
    'nav.reports': 'Raporlar',
    'nav.vessels': 'Gemiler',
    'nav.counterparties': 'Is Ortaklari',
    'nav.settings': 'Ayarlar',
    'nav.darkMode': 'Karanlik Mod',
    'nav.lightMode': 'Aydinlik Mod',
    // Dashboard
    'dashboard.title': 'Ana Sayfa',
    'dashboard.ongoingTrades': 'Devam Eden',
    'dashboard.pendingTrades': 'Bekleyen',
    'dashboard.completedTrades': 'Tamamlanan',
    'dashboard.inTransit': 'Transit halinde',
    'dashboard.awaitingConfirmation': 'Onay bekleniyor',
    'dashboard.increasedFromLastMonth': 'Gecen aya gore artti',
    'dashboard.upcomingPayments': 'Yaklasan Odemeler & Etkinlikler',
    'dashboard.dueInvoices': 'Vadesi gelen faturalar, toplantilar ve konferanslar',
    'dashboard.viewCalendar': 'Takvimi Gor',
    'dashboard.noUpcoming': 'Yaklasan etkinlik yok',
    'dashboard.tradeProgress': 'Anlasma Ilerlemesi',
    'dashboard.overallCompletion': 'Genel tamamlanma orani',
    'dashboard.viewAll': 'Tumunu Gor',
    'dashboard.completed': 'Tamamlanan',
    'dashboard.inProgress': 'Devam Eden',
    'dashboard.pending': 'Bekleyen',
    'dashboard.noTrades': 'Henuz anlasma yok',
    // Trades
    'trades.title': 'Anlasmalar',
    'trades.subtitle': 'Tum emtia anlasmalarinizi yonetin',
    'trades.searchPlaceholder': 'Anlasma ara...',
    'trades.filters': 'Filtreler',
    'trades.newTrade': 'Yeni Anlasma',
    'trades.ongoingTrades': 'Devam Eden Anlasmalar',
    'trades.ongoingDesc': 'Gemi detaylari olan anlasmalar',
    'trades.pendingTrades': 'Bekleyen Anlasmalar',
    'trades.pendingDesc': 'Gemi atamasi bekleniyor',
    'trades.completedTrades': 'Tamamlanan Anlasmalar',
    'trades.completedDesc': 'Basariyla kapanan sozlesmeler',
    'trades.clearFilter': 'Filtreyi Temizle',
    // Calendar
    'calendar.title': 'Takvim',
    'calendar.subtitle': 'Etkinlikleri, son tarihleri ve toplantilari takip edin',
    'calendar.addEvent': 'Etkinlik Ekle',
    'calendar.newEvent': 'Yeni Etkinlik',
    'calendar.editEvent': 'Etkinligi Duzenle',
    'calendar.selectDate': 'Bir tarih secin',
    'calendar.clickDay': 'Etkinlikleri gormek icin bir gune tiklayin',
    'calendar.noEvents': 'Bu gunde etkinlik yok',
    'calendar.allEvents': 'Tum Etkinlikler',
    'calendar.noScheduled': 'Planlanmis etkinlik yok',
    'calendar.holidays': 'Resmi Tatiller',
    'calendar.title_field': 'Baslik',
    'calendar.date_field': 'Tarih',
    'calendar.type_field': 'Tur',
    'calendar.description_field': 'Aciklama',
    'calendar.cancel': 'Iptal',
    'calendar.create': 'Olustur',
    'calendar.save': 'Kaydet',
    // Common
    'common.save': 'Kaydet',
    'common.cancel': 'Iptal',
    'common.delete': 'Sil',
    'common.edit': 'Duzenle',
    'common.add': 'Ekle',
    'common.search': 'Ara',
    'common.loading': 'Yukleniyor...',
  }
};

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  const changeLang = useCallback((newLang) => {
    setLang(newLang);
    localStorage.setItem('lang', newLang);
  }, []);

  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations.en?.[key] || key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
