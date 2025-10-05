import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex min-w-[220px] items-start justify-start bg-slate-900 p-4">
        <span className="text-xl font-semibold text-yellow-400">Inserted to test</span>
      </div>
      <div className="flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
