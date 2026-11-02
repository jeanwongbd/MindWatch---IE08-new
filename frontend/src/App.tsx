import { useState } from "react";
import DemoApp from "./DemoApp";
import WelcomeScreen from "./screens/WelcomeScreen";

export default function App() {
  const [demoOpen, setDemoOpen] = useState(false);
  return demoOpen ? <DemoApp /> : <WelcomeScreen onViewDemo={() => setDemoOpen(true)} />;
}
