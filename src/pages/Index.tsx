import CausalGraph from "@/components/CausalGraph";

const Index = () => {
  return (
    <div className="h-[100svh] w-full overflow-hidden">
      <div className="fixed inset-y-0 left-0 z-50 flex items-center pl-4">
        <span className="text-yellow-300 text-2xl font-semibold drop-shadow">Inserted to test</span>
      </div>
      <CausalGraph />
    </div>
  );
};

export default Index;
