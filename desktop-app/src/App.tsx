import { AvatarPanel } from "@/components/dashboard/avatar-panel";
import "./App.css";

function App() {
  return (
    <main className="w-full min-h-screen relative bg-[#09090b] text-white flex flex-col items-center font-sans tracking-tight">

      {/* Extremely Minimal Grid Background */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      <div className="z-10 w-full max-w-7xl h-screen flex flex-col p-6">
         <header className="mb-6 w-full border-b border-white/10 pb-4 flex justify-between items-end">
            <div>
               <h1 className="text-xl font-medium tracking-wide text-white/90 uppercase">
                  Sys.<span className="text-emerald-400">Terminal</span>
               </h1>
               <p className="text-xs font-mono text-white/40 mt-1">Av.Interface v1.0.0 // READY</p>
            </div>
         </header>

         <div className="flex-1 min-h-[500px]">
            <AvatarPanel />
         </div>
      </div>
    </main>
  );
}

export default App;
