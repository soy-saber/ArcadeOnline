import { adapter as tank } from "./tank";
import { adapter as bomb2 } from "./bomb2";
import { adapter as boxhead } from "./boxhead";
import { adapter as gunmayhem } from "./gunmayhem";
import { adapter as brawler } from "./brawler";
import { adapter as forest } from "./forest";
export const ADAPTERS = [tank, bomb2, boxhead, gunmayhem, brawler, forest];
export const getAdapter = (id: string) => ADAPTERS.find((adapter) => adapter.id === id);
