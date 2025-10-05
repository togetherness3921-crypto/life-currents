import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex w-64 flex-none items-center justify-center bg-transparent">
        <span className="text-2xl font-semibold text-yellow-300">Inserted to test</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
