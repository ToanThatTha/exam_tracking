// SV07. Xem kết quả — chỉ bài của chính sinh viên; đáp án đúng chỉ hiện khi giảng viên công khai
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../../api';
import { Bubble, Loading } from '../../components/ui';
import { fmtDateTime, SUBMIT_REASONS } from '../../utils/format';

export default function Result() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/student/attempts/${id}/result`).then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  }, [id]);

  if (error) return <div className="alert alert-danger">{error} <Link to="/student">Quay lại</Link></div>;
  if (!data) return <Loading />;
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/student/results" className="small">← Kết quả của tôi</Link>
          <h1>{data.examTitle}</h1>
          <p>{data.roomName} · nộp lúc {fmtDateTime(data.submittedAt)} · {SUBMIT_REASONS[data.submitReason]}</p>
        </div>
      </div>
      <div className="card row" style={{ gap: 40 }}>
        <div>
          <div className="muted small">Điểm</div>
          <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: 'var(--primary)' }} className="mono">{data.score}<span className="muted" style={{ fontSize: '1.2rem' }}> / 10</span></div>
        </div>
        <div>
          <div className="muted small">Số câu đúng</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700 }} className="mono">{data.correctCount}/{data.totalQuestions}</div>
        </div>
      </div>
      {!data.showAnswers ? (
        <div className="alert alert-info" style={{ marginTop: 16 }}>Giảng viên chưa công khai đáp án cho bài thi này.</div>
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginBottom: 12 }}>Đáp án</h2>
          <div className="stack">
            {data.questions.map((q) => {
              const correct = q.options.find((o) => o.isCorrect);
              const right = q.chosenOptionId === correct?.id;
              return (
                <div key={q.index} style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <strong>Câu {q.index}.</strong>
                    <span className={`badge ${q.chosenOptionId == null ? '' : right ? 'badge-ok' : 'badge-danger'}`}>{q.chosenOptionId == null ? 'Bỏ trống' : right ? 'Đúng' : 'Sai'}</span>
                  </div>
                  <p style={{ marginBottom: 10 }}>{q.content}</p>
                  <div className="options" style={{ marginTop: 0 }}>
                    {q.options.map((o, k) => (
                      <div key={o.id} className={`option${o.isCorrect ? ' correct' : o.id === q.chosenOptionId ? ' wrong' : ''}`} style={{ cursor: 'default' }}>
                        <Bubble index={k} filled={o.id === q.chosenOptionId} />
                        <span>{o.content}</span>
                        {o.isCorrect && <span className="badge badge-ok" style={{ marginLeft: 'auto' }}>Đáp án đúng</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
