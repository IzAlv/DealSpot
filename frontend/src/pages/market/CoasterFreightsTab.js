import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Loader2, Package } from 'lucide-react';

export default function CoasterFreightsTab() {
  const [freightWeek, setFreightWeek] = useState(null);
  const [freightYear, setFreightYear] = useState(2026);
  const [freightData, setFreightData] = useState(null);
  const [freightLoading, setFreightLoading] = useState(false);

  useEffect(() => {
    if (freightWeek) {
      fetchFreightReport(freightWeek, freightYear);
    }
  }, [freightWeek, freightYear]);

  const fetchFreightReport = async (week, year) => {
    setFreightLoading(true);
    try {
      const res = await api.get(`/api/market/coaster-freights/${week}?year=${year}`);
      setFreightData(res.data);
    } catch (err) {
      setFreightData(null);
    } finally {
      setFreightLoading(false);
    }
  };

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const getWeeks = (y) => {
    const now = new Date();
    const maxWeek = y < now.getFullYear() ? 52 : (() => {
      const startOfYear = new Date(y, 0, 1);
      const days = Math.floor((now - startOfYear) / 86400000);
      return Math.ceil((days + startOfYear.getDay() + 1) / 7);
    })();
    
    const weeks = [];
    for (let w = 1; w <= maxWeek; w++) {
      const jan4 = new Date(y, 0, 4);
      const dayOfWeek = jan4.getDay() || 7;
      const monday = new Date(jan4);
      monday.setDate(jan4.getDate() - dayOfWeek + 1 + (w - 1) * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      const startDay = monday.getDate();
      const endDay = sunday.getDate();
      const startMonth = monthNames[monday.getMonth()];
      const endMonth = monthNames[sunday.getMonth()];
      
      const dateRange = startMonth === endMonth
        ? `${startDay}-${endDay} ${startMonth} ${monday.getFullYear()}`
        : `${startDay} ${startMonth} - ${endDay} ${endMonth} ${sunday.getFullYear()}`;
      
      weeks.push({ week: w, label: `Week ${w} (${dateRange})` });
    }
    return weeks;
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-green-700" data-testid="coaster-freights-title">Weekly Coaster Freight Market Reports</h2>
          <p className="text-sm text-green-700">(Azov-Black Sea & Baltic)</p>
        </div>
      </div>

      {/* Year Tabs */}
      <div className="flex items-center justify-center gap-2 mb-3">
        {[2023, 2024, 2025, 2026].map(y => (
          <Button key={y} size="sm"
            variant={freightYear === y ? 'default' : 'outline'}
            onClick={() => { setFreightYear(y); setFreightWeek(null); setFreightData(null); }}
            data-testid={`freight-year-${y}`}
          >
            {y}
          </Button>
        ))}
      </div>

      {/* Week Selector */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap mb-4">
        {getWeeks(freightYear).map(({ week, label }) => (
          <Button key={week} size="sm"
            variant={freightWeek === week ? 'default' : 'outline'}
            className="text-xs"
            onClick={() => setFreightWeek(week)}
            data-testid={`freight-week-${week}`}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Report Content */}
      <Card>
        <CardContent className="pt-4">
          {freightLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-muted-foreground">Loading freight report...</span>
            </div>
          ) : freightData?.found ? (
            <div className="space-y-6">
              {freightData.pdfUrl && (
                <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                  <span className="text-sm font-medium">Freight Market Report - Week {freightData.week}</span>
                  <a href={freightData.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" data-testid="freight-download-pdf">
                      <Package className="h-4 w-4 mr-2" />Download PDF
                    </Button>
                  </a>
                </div>
              )}
              
              {freightData.content && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 text-green-700">English Market Commentary</h3>
                  <div className="prose prose-sm max-w-none">
                    {freightData.content.split('\n\n').map((para, idx) => (
                      <p key={idx} className="text-sm leading-relaxed mb-3">{para}</p>
                    ))}
                  </div>
                </div>
              )}

              {freightData.contentRu && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 text-blue-700">Russian Market Commentary</h3>
                  <div className="prose prose-sm max-w-none">
                    {freightData.contentRu.split('\n\n').map((para, idx) => (
                      <p key={idx} className="text-sm leading-relaxed mb-3">{para}</p>
                    ))}
                  </div>
                </div>
              )}

              {freightData.pdfImages?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-3 text-green-700">Report Pages</h3>
                  <div className="space-y-4">
                    {freightData.pdfImages.map((imgSrc, idx) => (
                      <div key={idx} className="border rounded-lg overflow-hidden shadow-sm">
                        <img 
                          src={imgSrc} 
                          alt={`Freight Report Week ${freightData.week} - Page ${idx + 1}`}
                          className="w-full h-auto"
                          data-testid={`freight-pdf-page-${idx}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">{freightWeek ? `No report available for Week ${freightWeek}` : 'Select a week to view the freight report'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
