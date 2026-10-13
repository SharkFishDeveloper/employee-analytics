from fastapi import FastAPI
from routes.employee import router as employee_router
from routes.manager import router as manager_router
from routes.hr import router as hr_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="HR Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(employee_router)
app.include_router(manager_router)
app.include_router(hr_router)


@app.get("/")
def root():
    return {"message": "HR Analytics API is running"}