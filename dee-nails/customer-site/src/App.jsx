import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Home from "./pages/Home";
import Book from "./pages/Book";
import Booked from "./pages/Booked";
import Check from "./pages/Check";
import BottomNav from "./components/BottomNav";

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book" element={<Book />} />
          <Route path="/booked" element={<Booked />} />
          <Route path="/check" element={<Check />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}
