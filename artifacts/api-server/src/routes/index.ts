import { Router, type IRouter } from "express";
import healthRouter from "./health";
import billingRouter from "./billing";
import catalogRouter from "./catalog";
import buymeRouter from "./buyme";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/billing", billingRouter);
router.use("/catalog", catalogRouter);
router.use(buymeRouter);

export default router;
