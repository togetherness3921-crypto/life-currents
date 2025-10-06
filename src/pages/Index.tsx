import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full">
      <div className="flex w-64 items-center justify-center bg-black/80">
        <span className="text-2xl font-bold text-yellow-300">Inserted to test</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
