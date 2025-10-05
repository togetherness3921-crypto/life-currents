import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden flex">
      <div className="flex items-center justify-center bg-black/40 px-6 text-lg font-semibold text-yellow-300">
        Inserted to test
      </div>
      <div className="flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
