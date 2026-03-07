"use client";

import { useState } from "react";
import { useData } from "@/context/data-provider";
import { LeadCard } from "@/components/dashboard/lead-card";
import { Button } from "@/components/ui/button";
import { Unlock, Search, Database } from "lucide-react";
import { Input } from "@/components/ui/input";

export function LeadFeed() {
  const { leads, unlockAllLeads, userCredits } = useData();
  const [searchTerm, setSearchTerm] = useState("");

  // 1. Search Filter
  const filteredLeads = leads.filter(
    (lead) =>
      lead.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.city?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // 2. Bulk Unlock Math
  const lockedLeads = filteredLeads.filter((l) => !l.is_unlocked);
  const bulkCost = lockedLeads.length;

  const handleBulkUnlock = async () => {
    if (lockedLeads.length === 0) return;
    const ids = lockedLeads.map((l) => l.id);
    await unlockAllLeads(ids);
  };

  // 3. The Empty State
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/10">
        <Database size={48} className="mb-4 opacity-20" />
        <h3 className="text-xl font-bold text-white mb-2">
          Your Vault is Empty
        </h3>
        <p className="text-sm max-w-md text-center">
          You haven't extracted any leads yet. Go to your Dashboard, add a scan
          monitor, and let the background webhook do the heavy lifting!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4. Top Control Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0b0a0b] p-4 rounded-2xl border border-zinc-800">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            size={16}
          />
          <Input
            placeholder="Search businesses or cities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800 focus-visible:ring-[#ffe600] text-white w-full"
          />
        </div>

        {/* Bulk Actions */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="text-sm text-zinc-400">
            <span className="text-white font-bold">{filteredLeads.length}</span>{" "}
            Leads
          </div>
          <Button
            onClick={handleBulkUnlock}
            disabled={bulkCost === 0 || userCredits < bulkCost}
            className="w-full md:w-auto !bg-zinc-100 text-black hover:!bg-white font-bold transition-all shadow-md active:scale-95"
          >
            {userCredits < bulkCost && bulkCost > 0 ? (
              `Need ${bulkCost} CR for All`
            ) : (
              <>
                <Unlock size={16} className="mr-2" />
                {bulkCost === 0
                  ? "All Unlocked"
                  : `Unlock All (${bulkCost} CR)`}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 5. The Grid Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredLeads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>

      {/* No Search Results */}
      {filteredLeads.length === 0 && searchTerm && (
        <div className="text-center py-10 text-zinc-500">
          No leads match your search for "{searchTerm}".
        </div>
      )}
    </div>
  );
}
