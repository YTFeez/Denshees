"use client";

import { useState, useEffect } from "react";
import { Line } from "react-chartjs-2";
import { DateTime } from "luxon";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";


ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);


function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const DailyAnalysisChart = ({ campaignId, dailyData, todayData }) => {
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [],
  });

  useEffect(() => {
    if (!dailyData || !Array.isArray(dailyData) || dailyData.length === 0)
      return;


    const labels = dailyData.map((item) => formatDate(item.date));


    if (todayData?.data) {
      labels.push("Today");
    }


    const emailsSent = dailyData.map((item) => item.emails_sent || 0);
    if (todayData?.data?.stages_sum !== undefined) {
      emailsSent.push(todayData.data.stages_sum);
    }

    setChartData({
      labels,
      datasets: [
        {
          label: "Emails Sent",
          data: emailsSent,
          borderColor: "rgb(0, 0, 0)",
          backgroundColor: "rgba(255, 204, 102, 0.5)",
          fill: true,
          tension: 0.4,
        },
      ],
    });
  }, [dailyData, todayData]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          boxWidth: 15,
          usePointStyle: true,
          pointStyle: "circle",
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "rgba(0, 0, 0, 0.1)",
        },
        ticks: {
          precision: 0,
        },
      },
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          maxRotation: 0,
        },
      },
    },
  };

  return (
    <div className="h-[300px] w-full">
      {chartData.labels.length > 0 ? (
        <Line data={chartData} options={options} />
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">No data available</p>
        </div>
      )}
    </div>
  );
};

export default DailyAnalysisChart;
