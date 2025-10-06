import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="flex h-[100svh] w-full overflow-hidden">
      <div className="flex w-64 shrink-0 items-center justify-center bg-black/80 px-4">
        <span className="text-2xl font-semibold text-yellow-400">
          Inserted to test
        </span>
      </div>
      <div className="flex-1">
        <CausalGraph />
      </div>
    </div>
  );
};

export default Index;
